#include <CoreFoundation/CoreFoundation.h>
#include <IOKit/IOCFPlugIn.h>
#include <IOKit/IOKitLib.h>
#include <IOKit/scsi/SCSITaskLib.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static const int kSonyVendor = 0x054c;

static int read_number_property(io_registry_entry_t service, CFStringRef key) {
    CFTypeRef value = IORegistryEntrySearchCFProperty(
        service,
        kIOServicePlane,
        key,
        kCFAllocatorDefault,
        kIORegistryIterateRecursively | kIORegistryIterateParents
    );
    if (!value || CFGetTypeID(value) != CFNumberGetTypeID()) {
        if (value) CFRelease(value);
        return -1;
    }
    int result = -1;
    CFNumberGetValue((CFNumberRef)value, kCFNumberIntType, &result);
    CFRelease(value);
    return result;
}

static int string_property_equals(io_registry_entry_t service, CFStringRef key, const char *expected) {
    CFTypeRef value = IORegistryEntrySearchCFProperty(
        service,
        kIOServicePlane,
        key,
        kCFAllocatorDefault,
        kIORegistryIterateRecursively | kIORegistryIterateParents
    );
    if (!value || CFGetTypeID(value) != CFStringGetTypeID()) {
        if (value) CFRelease(value);
        return 0;
    }
    char text[128] = {0};
    int equal = CFStringGetCString((CFStringRef)value, text, sizeof(text), kCFStringEncodingUTF8)
        && strncmp(text, expected, strlen(expected)) == 0;
    CFRelease(value);
    return equal;
}

static int is_himd_product(int product) {
    switch (product) {
        case 0x017f: /* MZ-NH1 */
        case 0x0183: /* MZ-NH900 */
        case 0x0187: /* MZ-NH600/NH600D */
        case 0x0287: /* MZ-RH1 Hi-MD mode */
            return 1;
        default:
            return 0;
    }
}

static void print_ioreturn(const char *stage, IOReturn result) {
    fprintf(stderr, "{\"stage\":\"%s\",\"ioreturn\":%d,\"hex\":\"0x%08x\"}\n",
            stage, result, (unsigned int)result);
}

static SCSITaskDeviceInterface **open_device_interface(io_service_t service) {
    IOCFPlugInInterface **plugin = NULL;
    SCSITaskDeviceInterface **device = NULL;
    SInt32 score = 0;
    IOReturn result = IOCreatePlugInInterfaceForService(
        service, kIOSCSITaskDeviceUserClientTypeID, kIOCFPlugInInterfaceID, &plugin, &score
    );
    if (result != kIOReturnSuccess || !plugin) {
        print_ioreturn("create-plugin", result);
        return NULL;
    }
    HRESULT query = (*plugin)->QueryInterface(
        plugin, CFUUIDGetUUIDBytes(kIOSCSITaskDeviceInterfaceID), (LPVOID *)&device
    );
    IODestroyPlugInInterface(plugin);
    if (query != S_OK || !device) {
        fprintf(stderr, "{\"stage\":\"query-interface\",\"hresult\":%d}\n", (int)query);
        return NULL;
    }
    result = (*device)->ObtainExclusiveAccess(device);
    if (result != kIOReturnSuccess) {
        print_ioreturn("exclusive-access", result);
        (*device)->Release(device);
        return NULL;
    }
    return device;
}

static SCSITaskDeviceInterface **find_supported_device(int *vendor_out, int *product_out) {
    /*
     * SCSITaskUserClientIniter is attached to IOSCSILogicalUnitNub on the
     * generic macOS USB mass-storage stack.  Matching the Type00 peripheral
     * child reaches the block driver, but IOCreatePlugInInterfaceForService
     * rejects that child with kIOReturnUnsupported.
     */
    CFMutableDictionaryRef matching = IOServiceMatching("IOSCSILogicalUnitNub");
    if (!matching) return NULL;
    io_iterator_t iterator = IO_OBJECT_NULL;
    kern_return_t kr = IOServiceGetMatchingServices(MACH_PORT_NULL, matching, &iterator);
    if (kr != KERN_SUCCESS) {
        print_ioreturn("matching-services", kr);
        return NULL;
    }
    SCSITaskDeviceInterface **device = NULL;
    io_service_t service;
    while ((service = IOIteratorNext(iterator)) != IO_OBJECT_NULL) {
        int vendor = read_number_property(service, CFSTR("idVendor"));
        int product = read_number_property(service, CFSTR("idProduct"));
        if (vendor < 0 && string_property_equals(service, CFSTR("Vendor Identification"), "SONY")) {
            vendor = kSonyVendor;
        }
        if (vendor == kSonyVendor && (product < 0 || is_himd_product(product))) {
            device = open_device_interface(service);
            if (device) {
                *vendor_out = vendor;
                *product_out = product < 0 ? 0 : product;
            }
            IOObjectRelease(service);
            break;
        }
        IOObjectRelease(service);
    }
    IOObjectRelease(iterator);
    return device;
}

static IOReturn execute_scsi(
    SCSITaskDeviceInterface **device,
    UInt8 *cdb,
    UInt8 cdb_length,
    UInt8 direction,
    UInt8 *data,
    UInt32 data_length,
    UInt32 timeout,
    SCSI_Sense_Data *sense,
    SCSITaskStatus *status,
    UInt64 *transferred
) {
    SCSITaskInterface **task = (*device)->CreateSCSITask(device);
    if (!task) return kIOReturnNoMemory;
    IOReturn result = (*task)->SetCommandDescriptorBlock(task, cdb, cdb_length);
    if (result == kIOReturnSuccess && data_length > 0) {
        SCSITaskSGElement sg = {0};
        sg.address = (mach_vm_address_t)data;
        sg.length = data_length;
        UInt8 scsi_direction = direction == 1
            ? kSCSIDataTransfer_FromTargetToInitiator
            : kSCSIDataTransfer_FromInitiatorToTarget;
        result = (*task)->SetScatterGatherEntries(task, &sg, 1, data_length, scsi_direction);
    }
    if (result == kIOReturnSuccess) result = (*task)->SetTimeoutDuration(task, timeout);
    if (result == kIOReturnSuccess) {
        result = (*task)->ExecuteTaskSync(task, sense, status, transferred);
    }
    (*task)->Release(task);
    return result;
}

static int hex_value(char c) {
    if (c >= '0' && c <= '9') return c - '0';
    if (c >= 'a' && c <= 'f') return c - 'a' + 10;
    if (c >= 'A' && c <= 'F') return c - 'A' + 10;
    return -1;
}

static int decode_hex(const char *hex, UInt8 *output, size_t output_length) {
    if (strlen(hex) != output_length * 2) return 0;
    for (size_t i = 0; i < output_length; i++) {
        int high = hex_value(hex[i * 2]);
        int low = hex_value(hex[i * 2 + 1]);
        if (high < 0 || low < 0) return 0;
        output[i] = (UInt8)((high << 4) | low);
    }
    return 1;
}

static void print_hex(const UInt8 *data, size_t length) {
    static const char digits[] = "0123456789abcdef";
    for (size_t i = 0; i < length; i++) {
        putchar(digits[data[i] >> 4]);
        putchar(digits[data[i] & 0x0f]);
    }
}

static int serve_commands(void) {
    int vendor = 0, product = 0;
    SCSITaskDeviceInterface **device = find_supported_device(&vendor, &product);
    if (!device) {
        fprintf(stderr, "{\"stage\":\"discover\",\"error\":\"no-available-himd-scsi-device\"}\n");
        return 1;
    }
    printf("READY %04x %04x\n", vendor, product);
    fflush(stdout);

    char *line = NULL;
    size_t capacity = 0;
    while (getline(&line, &capacity, stdin) >= 0) {
        char *save = NULL;
        char *direction_text = strtok_r(line, " \t\r\n", &save);
        char *timeout_text = strtok_r(NULL, " \t\r\n", &save);
        char *length_text = strtok_r(NULL, " \t\r\n", &save);
        char *cdb_hex = strtok_r(NULL, " \t\r\n", &save);
        char *data_hex = strtok_r(NULL, " \t\r\n", &save);
        if (!direction_text || !timeout_text || !length_text || !cdb_hex) {
            printf("ERR protocol\n");
            fflush(stdout);
            continue;
        }
        UInt8 direction = direction_text[0] == 'i' ? 1 : direction_text[0] == 'o' ? 2 : 0;
        UInt32 timeout = (UInt32)strtoul(timeout_text, NULL, 10);
        UInt32 data_length = (UInt32)strtoul(length_text, NULL, 10);
        size_t cdb_length = strlen(cdb_hex) / 2;
        if (cdb_length == 0 || cdb_length > 16 || strlen(cdb_hex) != cdb_length * 2) {
            printf("ERR cdb\n");
            fflush(stdout);
            continue;
        }
        UInt8 cdb[16] = {0};
        UInt8 *data = data_length ? calloc(data_length, 1) : NULL;
        if (!decode_hex(cdb_hex, cdb, cdb_length) || (data_length && !data)) {
            free(data);
            printf("ERR allocation\n");
            fflush(stdout);
            continue;
        }
        if (direction == 2 && (!data_hex || !decode_hex(data_hex, data, data_length))) {
            free(data);
            printf("ERR output-data\n");
            fflush(stdout);
            continue;
        }
        SCSI_Sense_Data sense = {0};
        SCSITaskStatus status = 0;
        UInt64 transferred = 0;
        IOReturn result = execute_scsi(
            device, cdb, (UInt8)cdb_length, direction, data, data_length,
            timeout, &sense, &status, &transferred
        );
        printf("RESULT %08x %u %llu ", (unsigned int)result, status, transferred);
        print_hex((UInt8 *)&sense, sizeof(sense));
        putchar(' ');
        if (direction == 1 && data) print_hex(data, (size_t)transferred);
        putchar('\n');
        fflush(stdout);
        free(data);
    }
    free(line);
    (*device)->ReleaseExclusiveAccess(device);
    (*device)->Release(device);
    return 0;
}

static int probe_service(io_service_t service, int vendor, int product) {
    IOCFPlugInInterface **plugin = NULL;
    SCSITaskDeviceInterface **device = NULL;
    SInt32 score = 0;
    IOReturn result = IOCreatePlugInInterfaceForService(
        service,
        kIOSCSITaskDeviceUserClientTypeID,
        kIOCFPlugInInterfaceID,
        &plugin,
        &score
    );
    if (result != kIOReturnSuccess || !plugin) {
        print_ioreturn("create-plugin", result);
        return 2;
    }

    HRESULT query = (*plugin)->QueryInterface(
        plugin,
        CFUUIDGetUUIDBytes(kIOSCSITaskDeviceInterfaceID),
        (LPVOID *)&device
    );
    IODestroyPlugInInterface(plugin);
    plugin = NULL;
    if (query != S_OK || !device) {
        fprintf(stderr, "{\"stage\":\"query-interface\",\"hresult\":%d}\n", (int)query);
        return 3;
    }

    result = (*device)->ObtainExclusiveAccess(device);
    if (result != kIOReturnSuccess) {
        print_ioreturn("exclusive-access", result);
        (*device)->Release(device);
        return 4;
    }

    SCSITaskInterface **task = (*device)->CreateSCSITask(device);
    if (!task) {
        fprintf(stderr, "{\"stage\":\"create-task\",\"error\":\"null-task\"}\n");
        (*device)->ReleaseExclusiveAccess(device);
        (*device)->Release(device);
        return 5;
    }

    UInt8 inquiryCdb[6] = {0x12, 0, 0, 0, 36, 0};
    UInt8 inquiry[36] = {0};
    SCSITaskSGElement sg = {0};
    sg.address = (mach_vm_address_t)inquiry;
    sg.length = sizeof(inquiry);
    SCSI_Sense_Data sense = {0};
    SCSITaskStatus status = 0;
    UInt64 transferred = 0;

    result = (*task)->SetCommandDescriptorBlock(task, inquiryCdb, sizeof(inquiryCdb));
    if (result == kIOReturnSuccess) {
        result = (*task)->SetScatterGatherEntries(
            task, &sg, 1, sizeof(inquiry), kSCSIDataTransfer_FromTargetToInitiator
        );
    }
    if (result == kIOReturnSuccess) result = (*task)->SetTimeoutDuration(task, 10000);
    if (result == kIOReturnSuccess) {
        result = (*task)->ExecuteTaskSync(task, &sense, &status, &transferred);
    }

    if (result == kIOReturnSuccess && status == kSCSITaskStatus_GOOD) {
        printf("{\"ok\":true,\"vendorId\":%d,\"productId\":%d,\"bytes\":%llu,"
               "\"inquiryVendor\":\"%.*s\",\"inquiryProduct\":\"%.*s\"}\n",
               vendor, product, transferred, 8, inquiry + 8, 16, inquiry + 16);
    } else {
        fprintf(stderr,
                "{\"stage\":\"inquiry\",\"ioreturn\":%d,\"hex\":\"0x%08x\","
                "\"status\":%u,\"bytes\":%llu}\n",
                result, (unsigned int)result, status, transferred);
    }

    (*task)->Release(task);
    (*device)->ReleaseExclusiveAccess(device);
    (*device)->Release(device);
    return (result == kIOReturnSuccess && status == kSCSITaskStatus_GOOD) ? 0 : 6;
}

int main(int argc, char **argv) {
    if (argc == 2 && strcmp(argv[1], "serve") == 0) return serve_commands();
    if (argc != 2 || strcmp(argv[1], "probe") != 0) {
        fprintf(stderr, "usage: wmd-scsi-helper probe|serve\n");
        return 64;
    }

    CFMutableDictionaryRef matching = IOServiceMatching("IOSCSILogicalUnitNub");
    if (!matching) return 70;
    io_iterator_t iterator = IO_OBJECT_NULL;
    kern_return_t kr = IOServiceGetMatchingServices(MACH_PORT_NULL, matching, &iterator);
    if (kr != KERN_SUCCESS) {
        print_ioreturn("matching-services", kr);
        return 71;
    }

    int found = 0;
    int finalResult = 1;
    io_service_t service;
    while ((service = IOIteratorNext(iterator)) != IO_OBJECT_NULL) {
        int vendor = read_number_property(service, CFSTR("idVendor"));
        int product = read_number_property(service, CFSTR("idProduct"));
        if (vendor < 0 && string_property_equals(service, CFSTR("Vendor Identification"), "SONY")) {
            vendor = kSonyVendor;
        }
        if (vendor == kSonyVendor && (product < 0 || is_himd_product(product))) {
            found = 1;
            finalResult = probe_service(service, vendor, product < 0 ? 0 : product);
            IOObjectRelease(service);
            break;
        }
        IOObjectRelease(service);
    }
    IOObjectRelease(iterator);
    if (!found) {
        fprintf(stderr, "{\"stage\":\"discover\",\"error\":\"no-supported-himd-device\"}\n");
        return 1;
    }
    return finalResult;
}
