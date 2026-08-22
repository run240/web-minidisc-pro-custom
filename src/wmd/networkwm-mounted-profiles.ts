export interface MountedNetworkWMProfile {
    productId: number;
    readOnly: boolean;
}

// Add only models validated against their real Windows mass-storage volume.
// New models start read-only until transfer, reconnect, playback, and delete
// validation has completed on the physical device.
export const MOUNTED_NETWORK_WM_PROFILES: readonly MountedNetworkWMProfile[] = [
    { productId: 0x0269, readOnly: false }, // Sony NW-A3000
    { productId: 0x026a, readOnly: false }, // Sony NW-A1000
];

export function getMountedNetworkWMProfile(productId: number): MountedNetworkWMProfile | null {
    return MOUNTED_NETWORK_WM_PROFILES.find(profile => profile.productId === productId) ?? null;
}
