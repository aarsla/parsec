#import <AVFoundation/AVFoundation.h>

// Returns: 0 = notDetermined, 1 = restricted, 2 = denied, 3 = authorized
int check_mic_auth_status(void) {
    return (int)[AVCaptureDevice authorizationStatusForMediaType:AVMediaTypeAudio];
}
