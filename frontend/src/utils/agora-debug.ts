export const AgoraDebugger = {
  // Debug video track state
  debugVideoTrack: (track: any, trackType: 'local' | 'remote') => {
    if (!track) {
      console.log(`🔥 AGORA DEBUG: ${trackType} video track is null/undefined`);
      return;
    }
    
    console.log(`🔥 AGORA DEBUG: ${trackType} video track details:`, {
      enabled: track.enabled,
      muted: track.muted,
      trackId: track.getTrackId?.(),
      mediaStreamTrack: !!track.getMediaStreamTrack?.(),
      mediaStreamTrackState: track.getMediaStreamTrack?.()?.readyState,
      mediaStreamTrackEnabled: track.getMediaStreamTrack?.()?.enabled,
      hasPlay: typeof track.play === 'function',
      hasStop: typeof track.stop === 'function',
      hasClose: typeof track.close === 'function'
    });
    
    // Check if media stream track is active
    const mediaStreamTrack = track.getMediaStreamTrack?.();
    if (mediaStreamTrack) {
      console.log(`🔥 AGORA DEBUG: ${trackType} MediaStreamTrack state:`, {
        readyState: mediaStreamTrack.readyState,
        enabled: mediaStreamTrack.enabled,
        muted: mediaStreamTrack.muted,
        label: mediaStreamTrack.label,
        kind: mediaStreamTrack.kind
      });
    }
  },
  
  // Debug video container
  debugVideoContainer: (container: HTMLElement | null, containerType: 'local' | 'remote') => {
    if (!container) {
      console.log(`🔥 AGORA DEBUG: ${containerType} video container is null`);
      return;
    }
    
    console.log(`🔥 AGORA DEBUG: ${containerType} video container details:`, {
      tagName: container.tagName,
      id: container.id,
      className: container.className,
      clientWidth: container.clientWidth,
      clientHeight: container.clientHeight,
      childElementCount: container.childElementCount,
      hasVideoChild: container.querySelector('video') !== null,
      style: container.style.cssText
    });
    
    // Check for video elements
    const videoElements = container.querySelectorAll('video');
    videoElements.forEach((video, index) => {
      console.log(`🔥 AGORA DEBUG: ${containerType} video element ${index}:`, {
        src: video.src,
        srcObject: !!video.srcObject,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        paused: video.paused,
        muted: video.muted,
        autoplay: video.autoplay,
        controls: video.controls,
        readyState: video.readyState,
        networkState: video.networkState
      });
    });
  },
  
  // Debug RTC client state
  debugRTCClient: (client: any) => {
    if (!client) {
      console.log('🔥 AGORA DEBUG: RTC client is null/undefined');
      return;
    }
    
    console.log('🔥 AGORA DEBUG: RTC client details:', {
      connectionState: client.connectionState,
      localTracks: client.localTracks?.length || 0,
      remoteUsers: client.remoteUsers?.length || 0,
      mode: client.mode,
      codec: client.codec
    });
    
    // Debug local tracks
    if (client.localTracks) {
      client.localTracks.forEach((track: any, index: number) => {
        console.log(`🔥 AGORA DEBUG: Local track ${index}:`, {
          kind: track.kind,
          trackId: track.getTrackId?.(),
          enabled: track.enabled,
          muted: track.muted
        });
      });
    }
    
    // Debug remote users
    if (client.remoteUsers) {
      client.remoteUsers.forEach((user: any, index: number) => {
        console.log(`🔥 AGORA DEBUG: Remote user ${index}:`, {
          uid: user.uid,
          hasAudio: !!user.audioTrack,
          hasVideo: !!user.videoTrack,
          audioTrackEnabled: user.audioTrack?.enabled,
          videoTrackEnabled: user.videoTrack?.enabled
        });
      });
    }
  },
  
  // Debug media permissions
  debugMediaPermissions: async () => {
    try {
      const permissions = await navigator.permissions.query({ name: 'camera' as PermissionName });
      console.log('🔥 AGORA DEBUG: Camera permission state:', permissions.state);
      
      const audioPermissions = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      console.log('🔥 AGORA DEBUG: Microphone permission state:', audioPermissions.state);
    } catch (error) {
      console.log('🔥 AGORA DEBUG: Could not check permissions:', error);
    }
    
    // Check for media devices
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(device => device.kind === 'videoinput');
      const audioDevices = devices.filter(device => device.kind === 'audioinput');
      
      console.log('🔥 AGORA DEBUG: Available devices:', {
        videoDevices: videoDevices.length,
        audioDevices: audioDevices.length,
        devices: devices.map(d => ({
          kind: d.kind,
          label: d.label,
          deviceId: d.deviceId.substring(0, 10) + '...'
        }))
      });
    } catch (error) {
      console.log('🔥 AGORA DEBUG: Could not enumerate devices:', error);
    }
  },
  
  // Complete debug suite
  debugAll: async (rtcClient: any, localVideoTrack: any, remoteUsers: any[], localVideoContainer: HTMLElement | null, remoteVideoContainer: HTMLElement | null) => {
    console.log('🔥 AGORA DEBUG: Starting complete debug suite...');
    
    // Debug media permissions
    await AgoraDebugger.debugMediaPermissions();
    
    // Debug RTC client
    AgoraDebugger.debugRTCClient(rtcClient);
    
    // Debug video tracks
    AgoraDebugger.debugVideoTrack(localVideoTrack, 'local');
    if (remoteUsers.length > 0) {
      AgoraDebugger.debugVideoTrack(remoteUsers[0].videoTrack, 'remote');
    }
    
    // Debug video containers
    AgoraDebugger.debugVideoContainer(localVideoContainer, 'local');
    AgoraDebugger.debugVideoContainer(remoteVideoContainer, 'remote');
    
    console.log('🔥 AGORA DEBUG: Debug suite completed');
  }
};

export default AgoraDebugger; 