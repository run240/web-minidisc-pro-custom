#!/usr/bin/env bash

# Usage: unix-unmount <VID> <PID>
# Author: asivery

if [ "$#" -ne 2 ]; then
    echo "Usage: $0 <VID> <PID>"
    exit 1
fi

VID="$1"
PID="$2"

function unmount_linux(){
    udevadm trigger -v -n -s block -p ID_VENDOR_ID=$VID -p ID_MODEL_ID=$PID | while IFS= read -r line; do
        device_name=$(basename "$line")
        umount "/dev/$device_name"
    done
}

function unmount_mac(){
    unmount_bsd_disk(){
        local BSD_NAME="$1"
        local DISKUTIL_PID

        is_mounted(){
            /sbin/mount | /usr/bin/grep -q "^/dev/${BSD_NAME} on "
        }

        # A published raw disk with no mounted volume needs no unmount.
        if ! is_mounted; then
            return 0
        fi

        # On macOS 14 FSKit, diskutil can successfully remove the mount point
        # but never return. Observe the real mount state instead of trusting
        # only the command's exit status.
        /usr/sbin/diskutil unmountDisk "$BSD_NAME" >/dev/null 2>&1 &
        DISKUTIL_PID=$!
        for _poll in {1..24}; do
            if ! is_mounted; then
                kill "$DISKUTIL_PID" 2>/dev/null || true
                wait "$DISKUTIL_PID" 2>/dev/null || true
                return 0
            fi
            if ! kill -0 "$DISKUTIL_PID" 2>/dev/null; then
                wait "$DISKUTIL_PID" 2>/dev/null || true
                break
            fi
            sleep 0.25
        done
        kill "$DISKUTIL_PID" 2>/dev/null || true
        wait "$DISKUTIL_PID" 2>/dev/null || true

        /usr/sbin/diskutil unmountDisk force "$BSD_NAME" >/dev/null 2>&1 &
        DISKUTIL_PID=$!
        for _poll in {1..40}; do
            if ! is_mounted; then
                kill "$DISKUTIL_PID" 2>/dev/null || true
                wait "$DISKUTIL_PID" 2>/dev/null || true
                return 0
            fi
            if ! kill -0 "$DISKUTIL_PID" 2>/dev/null; then
                wait "$DISKUTIL_PID" 2>/dev/null || true
                break
            fi
            sleep 0.25
        done
        kill "$DISKUTIL_PID" 2>/dev/null || true
        wait "$DISKUTIL_PID" 2>/dev/null || true

        if is_mounted; then
            echo "Unmount failed for $BSD_NAME" >&2
            return 1
        fi
        return 0
    }

    # Hi-MD can enumerate as USB before Disk Arbitration has published its
    # BSD disk. Wait for that short race instead of detaching the kernel mass-
    # storage driver and causing Finder's "not ejected properly" warning.
    for _attempt in {1..10}; do
        BSD_NAMES=$(system_profiler SPUSBDataType | while IFS= read -r line; do
            line=$(xargs <<< "$line")
            if [[ $line =~ ^Product\ ID.* ]]; then
                CUR_PID=$(cut -b 15-18 <<< "$line")
            elif [[ $line =~ ^Vendor\ ID.* ]]; then
                CUR_VID=$(cut -b 14-17 <<< "$line")
            elif [[ $line =~ ^BSD\ Name.* ]]; then
                BSD_NAME=$(cut -b 10- <<< "$line")
                if [[ "$CUR_PID" == "$PID" ]] && [[ "$CUR_VID" == "$VID" ]]; then
                    echo "$BSD_NAME"
                fi
            fi
        done)

        if [[ -n "$BSD_NAMES" ]]; then
            while IFS= read -r BSD_NAME; do
                [[ -z "$BSD_NAME" ]] && continue
                unmount_bsd_disk "$BSD_NAME" || exit 1
            done <<< "$BSD_NAMES"
            return 0
        fi
        sleep 0.5
    done

    # Some Hi-MD media expose no mountable filesystem. In that case there is
    # no BSD disk to unmount and direct USB access may proceed.
    return 0
}

if [ "$(uname)" == "Linux" ]; then
    unmount_linux
elif [ "$(uname)" == "Darwin" ]; then
    unmount_mac
fi
