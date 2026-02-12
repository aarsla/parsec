#import <AVFoundation/AVFoundation.h>

// Returns: 0 = notDetermined, 1 = restricted, 2 = denied, 3 = authorized
int check_mic_auth_status(void) {
    return (int)[AVCaptureDevice authorizationStatusForMediaType:AVMediaTypeAudio];
}

// Requests microphone access (non-blocking). The prompt appears asynchronously.
void request_mic_access(void) {
    [AVCaptureDevice requestAccessForMediaType:AVMediaTypeAudio completionHandler:^(BOOL granted) {
        (void)granted;
    }];
}
