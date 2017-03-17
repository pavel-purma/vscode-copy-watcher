import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
const cpx = require("cpx");
const Glob = require("glob").Glob;
const minimatch = require("minimatch");


class FileUtils {

    public static copyFile(source, target) {
        return new Promise(function (resolve, reject) {
            const rd = fs.createReadStream(source);
            rd.on('error', rejectCleanup);
            const wr = fs.createWriteStream(target);
            wr.on('error', rejectCleanup);
            function rejectCleanup(err) {
                if (rd) {
                    rd.destroy();
                }
                if (wr) {
                    wr.end();
                }
                wr.end();
                reject(err);
            }
            wr.on('finish', resolve);
            rd.pipe(wr);
        });
    }

    public static checkGlobMatch(file: string, includes: string[], excludes: string[]) {
        let matched = true;
        // check glob paterns
        if (includes) {
            for (let includePattern of includes) {
                if (!minimatch(file, includePattern)) {
                    matched = false;
                    break;
                }
            }
        }
        if (matched) {
            if (excludes) {
                for (let excludePattern of excludes) {
                    if (minimatch(file, excludePattern)) {
                        matched = false;
                        break;
                    }
                }
            }
        }
        return matched;
    }
}

interface ICopyWatcherBatchConfig {
    source: string;
    destination: string;
    destinationRequired: boolean;

    includes: string[];
    excludes: string[];

    initialCopy: boolean;
    initialCopyBothSides: boolean;
    deleteEnabled: boolean;
}

const CopyWatcherBatchOptionsDefault: ICopyWatcherBatchConfig = {
    source: null,
    destination: null,
    destinationRequired: true,
    includes: undefined,
    excludes: undefined,
    initialCopy: false,
    initialCopyBothSides: false,
    deleteEnabled: true
};

class CopyWatcherBatch {

    constructor(options: ICopyWatcherBatchConfig) {
        this.options = { ...CopyWatcherBatchOptionsDefault, ...options };
    }

    public options: ICopyWatcherBatchConfig;

    public channel: vscode.OutputChannel;

    public async initBatch() {
        if (this.options.initialCopy) {
            if (this.options.initialCopyBothSides) {
                await this.execInitialCopyReverse();
            }
            await this.execInitialCopy();
        }

        this.startWatch();
    }

    private async execInitialCopy() {
        this.channel.appendLine("Do initial copy...");
        const copyProcess = new CopyWatcherProcess();
        copyProcess.source = this.options.source;
        copyProcess.destination = this.options.destination;
        copyProcess.includes = this.options.includes;
        copyProcess.excludes = this.options.excludes;
        await copyProcess.copyNewerOnly(this.channel);
    }

    private async execInitialCopyReverse() {
        this.channel.appendLine("Do reverse initial copy...");
        const copyProcess = new CopyWatcherProcess();
        copyProcess.source = this.options.destination;
        copyProcess.destination = this.options.source;
        copyProcess.includes = this.options.includes;
        copyProcess.excludes = this.options.excludes;
        await copyProcess.copyNewerOnly(this.channel);
    }

    private watcher: vscode.FileSystemWatcher;

    private checkMatch(file: string): boolean {
        let srcPathWatch = path.resolve(vscode.workspace.rootPath, this.options.source);
        let pathRel = file.substr(srcPathWatch.length);
        if (pathRel.length > 0 && (pathRel[0] == "/" || pathRel[0] == "\\")) {
            pathRel = pathRel.substr(1);
        }

        let matched = FileUtils.checkGlobMatch(pathRel, this.options.includes, this.options.excludes);
        return matched;
    }

    // private startWatch() {
    //     this.channel.appendLine("Start watching...");

    //     // let srcPath = path.resolve(vscode.workspace.rootPath, this.options.source);
    //     // let srcPathGlob = path.resolve(srcPath, "**/*");
    //     //let srcPathGlob = this.options.source + "/**/*";
    //     let srcPathGlob = "**/*";

    //     this.watcher = vscode.workspace.createFileSystemWatcher(srcPathGlob, false, false, false);
    //     this.watcher.onDidChange((uri) => {
    //         debugger;
    //         this.channel.appendLine(`file changed: ${uri}`);
    //     });
    //     this.watcher.onDidCreate((uri) => {
    //         debugger;
    //         this.channel.appendLine(`file created: ${uri}`);
    //     });
    //     this.watcher.onDidDelete((uri) => {
    //         debugger;
    //         this.channel.appendLine(`file deleted: ${uri}`);
    //     });
    // }

    private startWatch() {
        if (!this.options.source || this.options.source == '') {
            return;
        }
        if (!this.options.destination || this.options.destination == '') {
            return;
        }
        let srcPathWatch = path.resolve(vscode.workspace.rootPath, this.options.source);
        let dstPathWatch = path.resolve(vscode.workspace.rootPath, this.options.destination);
        let srcPathWatchGlob = path.resolve(srcPathWatch, "**/*");

        if (this.options.destinationRequired && !fs.existsSync(dstPathWatch)) {
            this.channel.appendLine(`Destination '${this.options.destination}' does not exist. CopyWatcher not activated for this destination folder.`);
            return;
        }

        const cpxWather = cpx.watch(srcPathWatchGlob, dstPathWatch, { initialCopy: false });

        cpxWather.on("copy", (e) => {
            debugger;

            let srcPath = path.resolve(vscode.workspace.rootPath, e.srcPath);
            if (this.checkMatch(srcPath)) {
                let srcPath = path.resolve(vscode.workspace.rootPath, e.srcPath);
                // srcPath = path.relative(vscode.workspace.rootPath, srcPath);
                srcPath = srcPath;

                let dstPath = path.resolve(vscode.workspace.rootPath, e.dstPath);

                this.channel.appendLine(`Copy ${srcPath} => ${dstPath}`);
            }
        });

        cpxWather.on("remove", (e) => {
            debugger;

            let srcPath = path.resolve(vscode.workspace.rootPath, e.path);
            if (this.checkMatch(srcPath)) {
                this.channel.appendLine(`Remove ${e.path}`);
            }
        });

        cpxWather.on("watch-ready", (e) => {
            this.channel.appendLine(`Start watching copy from '${this.options.source}' to '${this.options.destination}'`);
        });

        cpxWather.on("watch-error", (e) => {
            this.channel.appendLine(`Watcher Error:\r\n${e}`);
        });
    }
}

class CopyWatcherProcess {

    public source: string;
    public destination: string;

    public includes: string[];
    public excludes: string[];

    public async copyNewerOnly(channel: vscode.OutputChannel) {
        const files = await this.getMatchedFiles();
        for (let file of files) {
            let srcPath = path.resolve(path.resolve(vscode.workspace.rootPath, this.source), file);
            let dstPath = path.resolve(path.resolve(vscode.workspace.rootPath, this.destination), file);

            var srcStats = fs.statSync(srcPath);
            var srcMtime = new Date(srcStats.mtime);

            var dstStats = fs.statSync(dstPath);
            var dstMtime = new Date(dstStats.mtime);

            // channel.appendLine(`src: ${srcMtime}, dst: ${dstMtime}`);

            let dtDiff = dstMtime.getTime() - srcMtime.getTime();
            if ((Math.abs(dtDiff) > 2000) && (srcMtime.getTime() > dstMtime.getTime())) {
                await FileUtils.copyFile(srcPath, dstPath);
                channel.appendLine(`Copy file: ${srcPath} => ${dstPath}`);
                fs.utimesSync(dstPath, srcStats.mtime, srcStats.mtime);
            }
        }
    }

    public getMatchedFiles(): Promise<string[]> {
        return new Promise<string[]>((resolve, reject) => {
            const ret: string[] = [];
            let pathToFind = path.resolve(vscode.workspace.rootPath, this.source);
            const mg = new Glob(path.resolve(pathToFind, "**/*"), {}, (err, files) => {
                if (err) {
                    reject(err);
                }
                if (files && !err) {
                    files.forEach((val) => {
                        let pathRel = (val as string).substr(pathToFind.length);
                        if (pathRel.length > 0 && (pathRel[0] == "/" || pathRel[0] == "\\")) {
                            pathRel = pathRel.substr(1);
                        }

                        let matched = FileUtils.checkGlobMatch(pathRel, this.includes, this.excludes);
                        if (matched) {
                            ret.push(pathRel);
                        }
                    });
                    resolve(ret);
                } else {
                    resolve([]);
                }
            });
        });
    }
}

const copyWatcherBatches: CopyWatcherBatch[] = [];

export function activate(context: vscode.ExtensionContext) {
    const config = vscode.workspace.getConfiguration('copyWatcher');
    if (config && config.paths && config.paths.length > 0) {
        const channel = vscode.window.createOutputChannel('Copy Watcher');
        channel.appendLine("Copy Watcher initialization ...");
        channel.appendLine(` - ${config.paths.length} copy paths configured`);
        channel.appendLine('');
        channel.show();
        for (let i = 0; i < config.paths.length; ++i) {
            const item = config.paths[i];

            const copyWatcher = new CopyWatcherBatch(item);
            copyWatcher.channel = channel;
            copyWatcher.initBatch();
            copyWatcherBatches.push();
        }
    }
}

export function deactivate() {
}



// exec_cpx(channel, item.source, item.destination, item.destinationRequired || true, item.initialCopy || false);

// function exec_cpx(channel: vscode.OutputChannel, source: string, destination: string, destinationRequired: boolean, initialCopy: boolean) {
//     if (!source || source == '') {
//         return;
//     }
//     if (!destination || destination == '') {
//         return;
//     }
//     let srcPath = path.resolve(vscode.workspace.rootPath, source);
//     let dstPath = path.resolve(vscode.workspace.rootPath, destination);

//     if (destinationRequired && !fs.existsSync(dstPath)) {
//         channel.appendLine(`Destination '${destination}' does not exist. CopyWatcher not activated for this destination folder.`);
//         return;
//     }

//     const cpxWather = cpx.watch(srcPath, dstPath, { update: true, initialCopy: initialCopy });

//     cpxWather.on("copy", (e) => {
//         let srcPath = path.normalize(path.resolve(vscode.workspace.rootPath, e.srcPath));
//         // srcPath = path.relative(vscode.workspace.rootPath, srcPath);
//         srcPath = path.basename(srcPath);

//         let dstPath = path.normalize(path.resolve(vscode.workspace.rootPath, e.dstPath));

//         channel.appendLine(`Copy ${srcPath} => ${dstPath}`);
//     });

//     cpxWather.on("remove", (e) => {
//         channel.appendLine(`Remove ${e.path}`);
//     });

//     cpxWather.on("watch-ready", (e) => {
//         channel.appendLine(`Start watching copy from '${source}' to '${destination}'`);
//     });

//     cpxWather.on("watch-error", (e) => {
//         channel.appendLine(`Error:\r\n${e}`);
//     });
// }

