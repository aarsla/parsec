#import <AppKit/AppKit.h>
#include <dispatch/dispatch.h>

bool copy_string_to_pasteboard(const char *str) {
    if (!str) return false;

    __block bool result = false;
    NSString *nsStr = [NSString stringWithUTF8String:str];

    // NSPasteboard is not documented as thread-safe; dispatch to main thread
    if ([NSThread isMainThread]) {
        NSPasteboard *pb = [NSPasteboard generalPasteboard];
        [pb clearContents];
        result = [pb setString:nsStr forType:NSPasteboardTypeString];
    } else {
        dispatch_sync(dispatch_get_main_queue(), ^{
            NSPasteboard *pb = [NSPasteboard generalPasteboard];
            [pb clearContents];
            result = [pb setString:nsStr forType:NSPasteboardTypeString];
        });
    }

    return result;
}
