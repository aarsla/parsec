#import <Foundation/Foundation.h>

#if __has_include(<ServiceManagement/SMAppService.h>)
#import <ServiceManagement/SMAppService.h>
#define HAS_SMAPPSERVICE 1
#else
#define HAS_SMAPPSERVICE 0
#endif

// Check if app is registered as a login item (macOS 13+)
int login_item_status(void) {
#if HAS_SMAPPSERVICE
    if (@available(macOS 13.0, *)) {
        SMAppService *service = [SMAppService mainAppService];
        return (int)service.status;
        // 0 = notRegistered, 1 = enabled, 2 = requiresApproval, 3 = notFound
    }
#endif
    return 0; // notRegistered
}

// Enable login item (macOS 13+). Returns 0 on success, -1 on failure.
int login_item_enable(void) {
#if HAS_SMAPPSERVICE
    if (@available(macOS 13.0, *)) {
        NSError *error = nil;
        BOOL ok = [[SMAppService mainAppService] registerAndReturnError:&error];
        if (!ok) {
            NSLog(@"Failed to register login item: %@", error);
            return -1;
        }
        return 0;
    }
#endif
    return -1;
}

// Disable login item (macOS 13+). Returns 0 on success, -1 on failure.
int login_item_disable(void) {
#if HAS_SMAPPSERVICE
    if (@available(macOS 13.0, *)) {
        NSError *error = nil;
        BOOL ok = [[SMAppService mainAppService] unregisterAndReturnError:&error];
        if (!ok) {
            NSLog(@"Failed to unregister login item: %@", error);
            return -1;
        }
        return 0;
    }
#endif
    return -1;
}
