#import <Foundation/Foundation.h>
#import <IOKit/IOKitLib.h>
#import <IOUSBHost/IOUSBHost.h>

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

static uint32_t gTag = 1;

static int hexValue(char c) {
    if (c >= '0' && c <= '9') return c - '0';
    if (c >= 'a' && c <= 'f') return c - 'a' + 10;
    if (c >= 'A' && c <= 'F') return c - 'A' + 10;
    return -1;
}

static BOOL decodeHex(const char *hex, uint8_t *output, size_t length) {
    if (strlen(hex) != length * 2) return NO;
    for (size_t i = 0; i < length; i++) {
        int high = hexValue(hex[i * 2]);
        int low = hexValue(hex[i * 2 + 1]);
        if (high < 0 || low < 0) return NO;
        output[i] = (uint8_t)((high << 4) | low);
    }
    return YES;
}

static void printHex(const uint8_t *data, size_t length) {
    static const char digits[] = "0123456789abcdef";
    for (size_t i = 0; i < length; i++) {
        putchar(digits[data[i] >> 4]);
        putchar(digits[data[i] & 0x0f]);
    }
}

static void printError(NSString *stage, NSError *error) {
    fprintf(stderr,
            "{\"stage\":\"%s\",\"domain\":\"%s\",\"code\":%lld,\"message\":\"%s\"}\n",
            stage.UTF8String,
            error.domain.UTF8String,
            (long long)error.code,
            error.localizedDescription.UTF8String);
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

static BOOL isHiMDProduct(int product) {
    switch (product) {
        case 0x017f: case 0x0181: case 0x0183: case 0x0185:
        case 0x0187: case 0x018b: case 0x01ea: case 0x021a:
        case 0x021c: case 0x022d: case 0x023d: case 0x0287:
            return YES;
        default:
            return NO;
    }
}

static IOUSBHostDevice *captureHiMDDevice(int *vendorOut, int *productOut) {
    CFMutableDictionaryRef matching = IOServiceMatching("IOUSBHostDevice");
    if (!matching) return nil;

    io_iterator_t iterator = IO_OBJECT_NULL;
    kern_return_t kr = IOServiceGetMatchingServices(MACH_PORT_NULL, matching, &iterator);
    if (kr != KERN_SUCCESS) {
        fprintf(stderr, "{\"stage\":\"matching-devices\",\"ioreturn\":%d}\n", kr);
        return nil;
    }

    IOUSBHostDevice *device = nil;
    io_service_t service;
    while ((service = IOIteratorNext(iterator)) != IO_OBJECT_NULL) {
        int vendor = readNumber(service, CFSTR("idVendor"));
        int product = readNumber(service, CFSTR("idProduct"));
        if (vendor != 0x054c || !isHiMDProduct(product)) {
            IOObjectRelease(service);
            continue;
        }

        NSError *error = nil;
        device = [[IOUSBHostDevice alloc]
            initWithIOService:service
            options:IOUSBHostObjectInitOptionsDeviceCapture
            queue:nil
            error:&error
            interestHandler:nil];
        if (device) {
            *vendorOut = vendor;
            *productOut = product;
            IOObjectRelease(service);
            break;
        }
        if (error) printError(@"capture-device", error);
        IOObjectRelease(service);
    }
    IOObjectRelease(iterator);
    return device;
}

static IOUSBHostInterface *openHiMDInterface(int vendor, int product) {
    CFMutableDictionaryRef matching = IOServiceMatching("IOUSBHostInterface");
    if (!matching) return nil;

    io_iterator_t iterator = IO_OBJECT_NULL;
    kern_return_t kr = IOServiceGetMatchingServices(MACH_PORT_NULL, matching, &iterator);
    if (kr != KERN_SUCCESS) {
        fprintf(stderr, "{\"stage\":\"matching-services\",\"ioreturn\":%d}\n", kr);
        return nil;
    }

    IOUSBHostInterface *hostInterface = nil;
    io_service_t service;
    while ((service = IOIteratorNext(iterator)) != IO_OBJECT_NULL) {
        int candidateVendor = readNumber(service, CFSTR("idVendor"));
        int candidateProduct = readNumber(service, CFSTR("idProduct"));
        int interfaceNumber = readNumber(service, CFSTR("bInterfaceNumber"));
        int interfaceClass = readNumber(service, CFSTR("bInterfaceClass"));
        int interfaceProtocol = readNumber(service, CFSTR("bInterfaceProtocol"));
        if (candidateVendor != vendor || candidateProduct != product || interfaceNumber != 0 ||
            interfaceClass != 8 || interfaceProtocol != 0x50) {
            IOObjectRelease(service);
            continue;
        }
        NSError *error = nil;
        hostInterface = [[IOUSBHostInterface alloc]
            initWithIOService:service
            options:IOUSBHostObjectInitOptionsNone
            queue:nil
            error:&error
            interestHandler:nil];
        if (hostInterface) {
            IOObjectRelease(service);
            break;
        }
        if (error) printError(@"open-interface", error);
        IOObjectRelease(service);
    }
    IOObjectRelease(iterator);
    return hostInterface;
}

static BOOL sendPipe(IOUSBHostPipe *pipe, NSMutableData *data, NSTimeInterval timeout,
                     NSUInteger *transferred, NSString *stage) {
    NSError *error = nil;
    BOOL ok = [pipe sendIORequestWithData:data
                         bytesTransferred:transferred
                        completionTimeout:timeout
                                    error:&error];
    if (!ok && error) printError(stage, error);
    return ok;
}

static BOOL executeBOT(IOUSBHostPipe *pipeIn, IOUSBHostPipe *pipeOut,
                       const uint8_t *cdb, size_t cdbLength, uint8_t direction,
                       uint8_t *data, uint32_t dataLength, uint32_t timeoutMs,
                       uint8_t *statusOut, uint32_t *transferredOut) {
    uint8_t cbw[31] = {0};
    uint32_t tag = gTag++;
    cbw[0] = 0x55; cbw[1] = 0x53; cbw[2] = 0x42; cbw[3] = 0x43;
    memcpy(cbw + 4, &tag, sizeof(tag));
    memcpy(cbw + 8, &dataLength, sizeof(dataLength));
    cbw[12] = direction == 1 ? 0x80 : 0x00;
    cbw[13] = 0;
    cbw[14] = (uint8_t)cdbLength;
    memcpy(cbw + 15, cdb, cdbLength);

    NSTimeInterval timeout = timeoutMs == 0 ? 0 : ((NSTimeInterval)timeoutMs / 1000.0);
    NSUInteger transferred = 0;
    NSMutableData *cbwData = [NSMutableData dataWithBytes:cbw length:sizeof(cbw)];
    if (!sendPipe(pipeOut, cbwData, timeout, &transferred, @"bulk-cbw")) return NO;
    if (transferred != sizeof(cbw)) {
        fprintf(stderr, "{\"stage\":\"bulk-cbw-short\",\"bytes\":%lu}\n", (unsigned long)transferred);
        return NO;
    }

    uint32_t payloadTransferred = 0;
    if (dataLength > 0) {
        NSMutableData *payload = direction == 1
            ? [NSMutableData dataWithLength:dataLength]
            : [NSMutableData dataWithBytes:data length:dataLength];
        transferred = 0;
        IOUSBHostPipe *pipe = direction == 1 ? pipeIn : pipeOut;
        if (!sendPipe(pipe, payload, timeout, &transferred,
                      direction == 1 ? @"bulk-data-in" : @"bulk-data-out")) return NO;
        payloadTransferred = (uint32_t)transferred;
        if (direction == 1 && transferred > 0) memcpy(data, payload.bytes, transferred);
    }

    NSMutableData *cswData = [NSMutableData dataWithLength:13];
    transferred = 0;
    if (!sendPipe(pipeIn, cswData, timeout, &transferred, @"bulk-csw")) return NO;
    if (transferred != 13) {
        fprintf(stderr, "{\"stage\":\"bulk-csw-short\",\"bytes\":%lu}\n", (unsigned long)transferred);
        return NO;
    }
    const uint8_t *csw = cswData.bytes;
    if (csw[0] != 0x55 || csw[1] != 0x53 || csw[2] != 0x42 || csw[3] != 0x53 ||
        memcmp(csw + 4, &tag, sizeof(tag)) != 0) {
        fprintf(stderr, "{\"stage\":\"bulk-csw-invalid\"}\n");
        return NO;
    }
    *statusOut = csw[12] == 0 ? 0 : 2;
    *transferredOut = payloadTransferred;
    return YES;
}

static int serve(void) {
    int vendor = 0, product = 0;
    IOUSBHostDevice *device = captureHiMDDevice(&vendor, &product);
    if (!device) {
        fprintf(stderr, "{\"stage\":\"capture\",\"error\":\"no-available-himd-usb-device\"}\n");
        return 1;
    }

    // Device capture terminates the kernel mass-storage client.  The interface
    // service remains registered, but give IOKit a moment to finish closing
    // the old owner before creating our fresh interface user client.
    usleep(250000);
    IOUSBHostInterface *hostInterface = openHiMDInterface(vendor, product);
    if (!hostInterface) {
        fprintf(stderr, "{\"stage\":\"discover\",\"error\":\"no-available-himd-usb-interface\"}\n");
        [device destroy];
        return 1;
    }
    NSError *error = nil;
    IOUSBHostPipe *pipeIn = [hostInterface copyPipeWithAddress:0x81 error:&error];
    if (!pipeIn) {
        if (error) printError(@"copy-pipe-in", error);
        [hostInterface destroy];
        [device destroy];
        return 2;
    }
    error = nil;
    IOUSBHostPipe *pipeOut = [hostInterface copyPipeWithAddress:0x02 error:&error];
    if (!pipeOut) {
        if (error) printError(@"copy-pipe-out", error);
        [hostInterface destroy];
        [device destroy];
        return 3;
    }

    printf("READY %04x %04x\n", vendor, product);
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
        uint8_t direction = directionText[0] == 'i' ? 1 : directionText[0] == 'o' ? 2 : 0;
        uint32_t timeout = (uint32_t)strtoul(timeoutText, NULL, 10);
        uint32_t dataLength = (uint32_t)strtoul(lengthText, NULL, 10);
        size_t cdbLength = strlen(cdbHex) / 2;
        if (cdbLength == 0 || cdbLength > 16 || strlen(cdbHex) != cdbLength * 2) {
            printf("ERR cdb\n"); fflush(stdout); continue;
        }
        uint8_t cdb[16] = {0};
        uint8_t *data = dataLength ? calloc(dataLength, 1) : NULL;
        if (!decodeHex(cdbHex, cdb, cdbLength) || (dataLength && !data) ||
            (direction == 2 && (!dataHex || !decodeHex(dataHex, data, dataLength)))) {
            free(data); printf("ERR data\n"); fflush(stdout); continue;
        }
        uint8_t status = 0;
        uint32_t transferred = 0;
        BOOL ok = executeBOT(pipeIn, pipeOut, cdb, cdbLength, direction,
                             data, dataLength, timeout, &status, &transferred);
        uint8_t sense[64] = {0};
        printf("RESULT %08x %u %u ", ok ? 0 : 0xe00002d6, status, transferred);
        printHex(sense, sizeof(sense));
        putchar(' ');
        if (ok && direction == 1 && data) printHex(data, transferred);
        putchar('\n'); fflush(stdout);
        free(data);
    }
    free(line);
    [hostInterface destroy];
    [device destroy];
    return 0;
}

int main(int argc, char **argv) {
    @autoreleasepool {
        if (argc == 2 && strcmp(argv[1], "serve") == 0) return serve();
        fprintf(stderr, "usage: wmd-scsi-helper serve\n");
        return 64;
    }
}
