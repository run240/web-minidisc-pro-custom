import { join as pathJoin } from 'path';
import { execFile } from 'child_process';

export async function unmountAll(vid: number, pid: number){
    await new Promise<void>((res, rej) => {
        execFile(
            pathJoin(__dirname, "..", "res", "unix-unmount.sh"),
            [
            vid.toString(16).padStart(4, '0'),
            pid.toString(16).padStart(4, '0'),
            ],
            (err, stdout, stderr) => {
            console.log(err);
            console.log(stdout);
            console.log(stderr);
            if (err) rej(err);
            else res();
            },
        );
    });
}
