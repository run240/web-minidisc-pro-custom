#include <CoreFoundation/CoreFoundation.h>
#include <IOKit/IOCFPlugIn.h>
#include <IOKit/IOKitLib.h>
#include <IOKit/usb/IOUSBLib.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef struct {
    IOUSBInterfaceInterface550 **interface;
    UInt8 pipeIn;
    UInt8 pipeOut;
    int vendor;
    int product;
} USBTransport;

static UInt32 gTag = 1;

static void printIOReturn(const char *stage, IOReturn result) {
    fprintf(stderr, "{\"stage\":\"%s\",\"ioreturn\":%d,\"hex\":\"0x%08x\"}\n",
            stage, result, (unsigned int)result);
}

static int readNumber(io_service_t service, CFStringRef key) {
    CFTypeRef value = IORegistryEntrySearchCFProperty(
        service, kIOServicePlane, key, kCFAllocatorDefault,
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

static int isHiMDProduct(int product) {
    switch (product) {
        case 0x017f: case 0x0181: case 0x0183: case 0x0185:
        case 0x0187: case 0x018b: case 0x01ea: case 0x021a:
        case 0x021c: case 0x022d: case 0x023d: case 0x0287:
            return 1;
        default:
            return 0;
    }
}

static int openTransport(USBTransport *transport) {
    CFMutableDictionaryRef matching = IOServiceMatching("IOUSBHostInterface");
    if (!matching) return 0;
    io_iterator_t iterator = IO_OBJECT_NULL;
    kern_return_t kr = IOServiceGetMatchingServices(MACH_PORT_NULL, matching, &iterator);
    if (kr != KERN_SUCCESS) {
        printIOReturn("matching-services", kr);
        return 0;
    }

    io_service_t service;
    while ((service = IOIteratorNext(iterator)) != IO_OBJECT_NULL) {
        int vendor = readNumber(service, CFSTR("idVendor"));
        int product = readNumber(service, CFSTR("idProduct"));
        int interfaceNumber = readNumber(service, CFSTR("bInterfaceNumber"));
        int interfaceClass = readNumber(service, CFSTR("bInterfaceClass"));
        int interfaceProtocol = readNumber(service, CFSTR("bInterfaceProtocol"));
        if (vendor != 0x054c || !isHiMDProduct(product) || interfaceNumber != 0 ||
            interfaceClass != 8 || interfaceProtocol != 0x50) {
            IOObjectRelease(service);
            continue;
        }

        IOCFPlugInInterface **plugin = NULL;
        SInt32 score = 0;
        IOReturn result = IOCreatePlugInInterfaceForService(
            service, kIOUSBInterfaceUserClientTypeID, kIOCFPlugInInterfaceID, &plugin, &score
        );
        if (result != kIOReturnSuccess || !plugin) {
            printIOReturn("create-usb-plugin", result);
            IOObjectRelease(service);
            continue;
        }
        IOUSBInterfaceInterface550 **usbInterface = NULL;
        HRESULT query = (*plugin)->QueryInterface(
            plugin, CFUUIDGetUUIDBytes(kIOUSBInterfaceInterfaceID550), (LPVOID *)&usbInterface
        );
        IODestroyPlugInInterface(plugin);
        if (query != S_OK || !usbInterface) {
            fprintf(stderr, "{\"stage\":\"query-usb-interface\",\"hresult\":%d}\n", (int)query);
            IOObjectRelease(service);
            continue;
        }

        result = (*usbInterface)->USBInterfaceOpenSeize(usbInterface);
        if (result != kIOReturnSuccess) {
            printIOReturn("open-interface-seize", result);
            (*usbInterface)->Release(usbInterface);
            IOObjectRelease(service);
            continue;
        }

        UInt8 endpointCount = 0;
        result = (*usbInterface)->GetNumEndpoints(usbInterface, &endpointCount);
        if (result != kIOReturnSuccess) {
            printIOReturn("get-endpoints", result);
            (*usbInterface)->USBInterfaceClose(usbInterface);
            (*usbInterface)->Release(usbInterface);
            IOObjectRelease(service);
            continue;
        }
        UInt8 pipeIn = 0, pipeOut = 0;
        for (UInt8 pipe = 1; pipe <= endpointCount; pipe++) {
            UInt8 direction = 0, number = 0, type = 0, interval = 0;
            UInt16 maxPacket = 0;
            result = (*usbInterface)->GetPipeProperties(
                usbInterface, pipe, &direction, &number, &type, &maxPacket, &interval
            );
            if (result == kIOReturnSuccess && type == kUSBBulk) {
                if (direction == kUSBIn) pipeIn = pipe;
                if (direction == kUSBOut) pipeOut = pipe;
            }
        }
        if (!pipeIn || !pipeOut) {
            fprintf(stderr, "{\"stage\":\"find-bulk-pipes\",\"in\":%u,\"out\":%u}\n",
                    pipeIn, pipeOut);
            (*usbInterface)->USBInterfaceClose(usbInterface);
            (*usbInterface)->Release(usbInterface);
            IOObjectRelease(service);
            continue;
        }
        transport->interface = usbInterface;
        transport->pipeIn = pipeIn;
        transport->pipeOut = pipeOut;
        transport->vendor = vendor;
        transport->product = product;
        IOObjectRelease(service);
        IOObjectRelease(iterator);
        return 1;
    }
    IOObjectRelease(iterator);
    return 0;
}

static int writePipe(USBTransport *transport, const void *data, UInt32 length,
                     UInt32 timeout, const char *stage) {
    IOReturn result = (*transport->interface)->WritePipeTO(
        transport->interface, transport->pipeOut, (void *)data, length, timeout, timeout
    );
    if (result != kIOReturnSuccess) printIOReturn(stage, result);
    return result == kIOReturnSuccess;
}

static int readPipe(USBTransport *transport, void *data, UInt32 *length,
                    UInt32 timeout, const char *stage) {
    IOReturn result = (*transport->interface)->ReadPipeTO(
        transport->interface, transport->pipeIn, data, length, timeout, timeout
    );
    if (result != kIOReturnSuccess) printIOReturn(stage, result);
    return result == kIOReturnSuccess;
}

static int executeBOT(USBTransport *transport, const UInt8 *cdb, size_t cdbLength,
                      UInt8 direction, UInt8 *data, UInt32 dataLength, UInt32 timeout,
                      UInt8 *statusOut, UInt32 *transferredOut) {
    UInt8 cbw[31] = {0};
    UInt32 tag = gTag++;
    cbw[0] = 0x55; cbw[1] = 0x53; cbw[2] = 0x42; cbw[3] = 0x43;
    memcpy(cbw + 4, &tag, sizeof(tag));
    memcpy(cbw + 8, &dataLength, sizeof(dataLength));
    cbw[12] = direction == 1 ? 0x80 : 0;
    cbw[14] = (UInt8)cdbLength;
    memcpy(cbw + 15, cdb, cdbLength);
    if (!writePipe(transport, cbw, sizeof(cbw), timeout, "bulk-cbw")) return 0;

    UInt32 transferred = 0;
    if (dataLength > 0) {
        if (direction == 1) {
            transferred = dataLength;
            if (!readPipe(transport, data, &transferred, timeout, "bulk-data-in")) return 0;
        } else {
            if (!writePipe(transport, data, dataLength, timeout, "bulk-data-out")) return 0;
            transferred = dataLength;
        }
    }

    UInt8 csw[13] = {0};
    UInt32 cswLength = sizeof(csw);
    if (!readPipe(transport, csw, &cswLength, timeout, "bulk-csw")) return 0;
    if (cswLength != sizeof(csw) || csw[0] != 0x55 || csw[1] != 0x53 ||
        csw[2] != 0x42 || csw[3] != 0x53 || memcmp(csw + 4, &tag, sizeof(tag)) != 0) {
        fprintf(stderr, "{\"stage\":\"invalid-csw\",\"bytes\":%u}\n", cswLength);
        return 0;
    }
    *statusOut = csw[12] == 0 ? 0 : 2;
    *transferredOut = transferred;
    return 1;
}

static int hexValue(char c) {
    if (c >= '0' && c <= '9') return c - '0';
    if (c >= 'a' && c <= 'f') return c - 'a' + 10;
    if (c >= 'A' && c <= 'F') return c - 'A' + 10;
    return -1;
}

static int decodeHex(const char *hex, UInt8 *output, size_t length) {
    if (strlen(hex) != length * 2) return 0;
    for (size_t i = 0; i < length; i++) {
        int high = hexValue(hex[i * 2]);
        int low = hexValue(hex[i * 2 + 1]);
        if (high < 0 || low < 0) return 0;
        output[i] = (UInt8)((high << 4) | low);
    }
    return 1;
}

static void printHex(const UInt8 *data, size_t length) {
    static const char digits[] = "0123456789abcdef";
    for (size_t i = 0; i < length; i++) {
        putchar(digits[data[i] >> 4]);
        putchar(digits[data[i] & 0x0f]);
    }
}

static int serve(void) {
    USBTransport transport = {0};
    if (!openTransport(&transport)) {
        fprintf(stderr, "{\"stage\":\"discover\",\"error\":\"no-available-himd-usb-interface\"}\n");
        return 1;
    }
    printf("READY %04x %04x\n", transport.vendor, transport.product);
    fflush(stdout);

    char *line = NULL;
    size_t capacity = 0;
    while (getline(&line, &capacity, stdin) >= 0) {
        char *save = NULL;
        char *directionText = strtok_r(line, " \t\r\n", &save);
        char *timeoutText = strtok_r(NULL, " \t\r\n", &save);
        char *lengthText = strtok_r(NULL, " \t\r\n", &save);
        char *cdbHex = strtok_r(NULL, " \t\r\n", &save);
        char *dataHex = strtok_r(NULL, " \t\r\n", &save);
        if (!directionText || !timeoutText || !lengthText || !cdbHex) {
            printf("ERR protocol\n"); fflush(stdout); continue;
        }
        UInt8 direction = directionText[0] == 'i' ? 1 : directionText[0] == 'o' ? 2 : 0;
        UInt32 timeout = (UInt32)strtoul(timeoutText, NULL, 10);
        UInt32 dataLength = (UInt32)strtoul(lengthText, NULL, 10);
        size_t cdbLength = strlen(cdbHex) / 2;
        if (!cdbLength || cdbLength > 16 || strlen(cdbHex) != cdbLength * 2) {
            printf("ERR cdb\n"); fflush(stdout); continue;
        }
        UInt8 cdb[16] = {0};
        UInt8 *data = dataLength ? calloc(dataLength, 1) : NULL;
        if (!decodeHex(cdbHex, cdb, cdbLength) || (dataLength && !data) ||
            (direction == 2 && (!dataHex || !decodeHex(dataHex, data, dataLength)))) {
            free(data); printf("ERR data\n"); fflush(stdout); continue;
        }
        UInt8 status = 0;
        UInt32 transferred = 0;
        int ok = executeBOT(&transport, cdb, cdbLength, direction, data, dataLength,
                            timeout, &status, &transferred);
        UInt8 sense[64] = {0};
        printf("RESULT %08x %u %u ", ok ? 0 : 0xe00002d6, status, transferred);
        printHex(sense, sizeof(sense));
        putchar(' ');
        if (ok && direction == 1 && data) printHex(data, transferred);
        putchar('\n'); fflush(stdout);
        free(data);
    }
    free(line);
    (*transport.interface)->USBInterfaceClose(transport.interface);
    (*transport.interface)->Release(transport.interface);
    return 0;
}

int main(int argc, char **argv) {
    if (argc == 2 && strcmp(argv[1], "serve") == 0) return serve();
    fprintf(stderr, "usage: wmd-scsi-helper serve\n");
    return 64;
}
