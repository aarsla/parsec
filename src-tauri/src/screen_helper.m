#import <AppKit/AppKit.h>
#import <CoreGraphics/CoreGraphics.h>

typedef struct {
    double x, y, width, height;
} ScreenRect;

ScreenRect get_usable_bounds_at_cursor(void) {
    CGEventRef event = CGEventCreate(NULL);
    CGPoint cursor = CGEventGetLocation(event);
    CFRelease(event);

    NSArray<NSScreen *> *screens = [NSScreen screens];
    NSScreen *primary = screens.firstObject;
    double primaryHeight = primary.frame.size.height;

    // Convert CG (top-left origin) to NS (bottom-left origin)
    NSPoint nsCursor = NSMakePoint(cursor.x, primaryHeight - cursor.y);

    for (NSScreen *screen in screens) {
        if (NSPointInRect(nsCursor, screen.frame)) {
            NSRect visible = screen.visibleFrame;
            ScreenRect result;
            result.x = visible.origin.x;
            result.y = primaryHeight - visible.origin.y - visible.size.height;
            result.width = visible.size.width;
            result.height = visible.size.height;
            return result;
        }
    }

    // Fallback: primary screen visible frame
    NSRect visible = primary.visibleFrame;
    ScreenRect result;
    result.x = visible.origin.x;
    result.y = primaryHeight - visible.origin.y - visible.size.height;
    result.width = visible.size.width;
    result.height = visible.size.height;
    return result;
}
