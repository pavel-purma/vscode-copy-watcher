import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
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

    public static async copyFileNewerOnly(srcPath, dstPath): Promise<boolean> {
        const srcStats = fs.statSync(srcPath);
        const srcMtime = new Date(srcStats.mtime);

        let dstMtime;
        const dstExists = fs.existsSync(dstPath);
        if (dstExists) {
            let dstStats = fs.statSync(dstPath);
            dstMtime = new Date(dstStats.mtime);
        }

        // CopyWatcher.consoleChannel.appendLine(`src: ${srcMtime}, dst: ${dstMtime}`);

        if (!dstExists || ((Math.abs(dstMtime.getTime() - srcMtime.getTime()) > 2000) && (srcMtime.getTime() > dstMtime.getTime()))) {
            await FileUtils.copyFile(srcPath, dstPath);
            fs.utimesSync(dstPath, srcStats.mtime, srcStats.mtime);
            return true;
        }
        return false;
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

    public static isFile(file: string): boolean {
        try {
            const stats = fs.lstatSync(file);
            return !stats.isDirectory();
        } catch (e) {
            return false;
        }
    }
}

interface ICopyWatcherSectionConfig {
    source: string;
    destination: string;
    destinationRequired: boolean;

    includes: string[];
    excludes: string[];

    initialCopy: boolean;
    initialCopyBothSides: boolean;
    deleteEnabled: boolean;
}

const CopyWatcherSectionOptionsDefault: ICopyWatcherSectionConfig = {
    source: null,
    destination: null,
    destinationRequired: true,
    includes: undefined,
    excludes: undefined,
    initialCopy: false,
    initialCopyBothSides: false,
    deleteEnabled: false
};

class CopyWatcherSection {

    constructor(options: ICopyWatcherSectionConfig) {
        this.options = { ...CopyWatcherSectionOptionsDefault, ...options };
    }

    public options: ICopyWatcherSectionConfig;

    private _srcPathWatch: string;

    public async initSection() {
        this._srcPathWatch = path.normalize(path.resolve(vscode.workspace.rootPath, this.options.source) + "/");

        CopyWatcher.consoleChannel.appendLine(`Section initialize: '${this.options.source}' => '${this.options.destination}'`);
        if (this.options.initialCopy) {
            if (this.options.initialCopyBothSides) {
                await this.execInitialCopyReverse();
            }
            await this.execInitialCopy();
        }
        CopyWatcher.consoleChannel.appendLine("");
    }

    private async execInitialCopy() {
        CopyWatcher.consoleChannel.appendLine("Do initial copy...");
        const copyProcess = new CopyWatcherProcess();
        copyProcess.source = this.options.source;
        copyProcess.destination = this.options.destination;
        copyProcess.includes = this.options.includes;
        copyProcess.excludes = this.options.excludes;
        await copyProcess.copyNewerOnly();
    }

    private async execInitialCopyReverse() {
        CopyWatcher.consoleChannel.appendLine("Do reverse initial copy...");
        const copyProcess = new CopyWatcherProcess();
        copyProcess.source = this.options.destination;
        copyProcess.destination = this.options.source;
        copyProcess.includes = this.options.includes;
        copyProcess.excludes = this.options.excludes;
        await copyProcess.copyNewerOnly();
    }

    private getRelativePathBySource(file: string): string {
        // check if file is inside source root
        if (path.normalize(file.substr(0, this._srcPathWatch.length)) != path.normalize(this._srcPathWatch)) {
            return null;
        }
        // figure out relative path from source root
        let relativePath = file.substr(this._srcPathWatch.length);
        if (relativePath.length > 0 && (relativePath[0] == "/" || relativePath[0] == "\\")) {
            relativePath = relativePath.substr(1);
        }
        return relativePath;
    }

    private checkMatch(relativePath: string): boolean {
        let matched = FileUtils.checkGlobMatch(relativePath, this.options.includes, this.options.excludes);
        return matched;
    }

    private async copyRelativePathFile(relativePath: string, watchAction: string) {
        const srcPath = path.resolve(path.resolve(vscode.workspace.rootPath, this.options.source), relativePath);
        const dstPath = path.resolve(path.resolve(vscode.workspace.rootPath, this.options.destination), relativePath);
        if (await FileUtils.copyFileNewerOnly(srcPath, dstPath)) {
            CopyWatcher.consoleChannel.appendLine(`Copy file (${watchAction}): ${srcPath} => ${dstPath}`);
        }
    }

    private async deleteRelativePathFile(relativePath: string) {
        const dstPath = path.resolve(path.resolve(vscode.workspace.rootPath, this.options.destination), relativePath);
        if (fs.existsSync(dstPath)) {
            CopyWatcher.consoleChannel.appendLine(`Delete file: ${dstPath}`);
            fs.unlinkSync(dstPath);
        }
    }

    public checkDestinationFolderExists(): boolean {
        const dstPath = path.resolve(vscode.workspace.rootPath, this.options.destination);
        let exists = fs.existsSync(dstPath);
        if (!exists) {
            CopyWatcher.consoleChannel.appendLine(`Section temporary disabled. Destination folder not found: '${this.options.destination}'`);
        }
        return exists;
    }

    public watcherFileChanged(file: string) {
        if (!FileUtils.isFile(file)) {
            return;
        }
        const relativePath = this.getRelativePathBySource(file);
        if (relativePath && this.checkMatch(relativePath)) {
            this.copyRelativePathFile(relativePath, "changed");
        }
    }

    public watcherFileCreated(file: string) {
        if (!FileUtils.isFile(file)) {
            return;
        }
        const relativePath = this.getRelativePathBySource(file);
        if (relativePath && this.checkMatch(relativePath)) {
            this.copyRelativePathFile(relativePath, "created");
        }
    }

    public watcherFileDeleted(file: string) {
        if (!this.options.deleteEnabled) {
            return;
        }
        const relativePath = this.getRelativePathBySource(file);
        if (this.checkMatch(relativePath)) {
            this.deleteRelativePathFile(relativePath);
        }
    }
}

class CopyWatcherProcess {

    public source: string;
    public destination: string;

    public includes: string[];
    public excludes: string[];

    public async copyNewerOnly() {
        const files = await this.getMatchedFiles();
        for (let file of files) {
            const srcPath = path.resolve(path.resolve(vscode.workspace.rootPath, this.source), file);
            const dstPath = path.resolve(path.resolve(vscode.workspace.rootPath, this.destination), file);
            if (await FileUtils.copyFileNewerOnly(srcPath, dstPath)) {
                CopyWatcher.consoleChannel.appendLine(`Copy file: ${srcPath} => ${dstPath}`);
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

class CopyWatcher {

    private static sections: CopyWatcherSection[] = [];

    public static consoleChannel: vscode.OutputChannel;

    public static async activate(context: vscode.ExtensionContext) {
        const config = vscode.workspace.getConfiguration('copyWatcher');
        if (config && config.sections && config.sections.length > 0) {
            CopyWatcher.consoleChannel = vscode.window.createOutputChannel('Copy Watcher');
            CopyWatcher.consoleChannel.appendLine(`Copy Watcher initialization - ${config.sections.length} copy section(s) found`);
            CopyWatcher.consoleChannel.appendLine('');
            //CopyWatcher.consoleChannel.show();
            for (let i = 0; i < config.sections.length; ++i) {
                const sectionOptions = config.sections[i];
                const section = new CopyWatcherSection(sectionOptions);
                let addSection = true;
                if (sectionOptions.destinationRequired) {
                    addSection = section.checkDestinationFolderExists();
                }
                if (addSection) {
                    CopyWatcher.sections.push(section);
                }
            }

            for (let section of CopyWatcher.sections) {
                await section.initSection();
            }

            if (CopyWatcher.sections.length > 0) {
                CopyWatcher.startWatch();
            }
        }
    }

    public static deactivate() {
        if (CopyWatcher.watcher) {
            CopyWatcher.watcher.dispose();
            CopyWatcher.watcher = null;
            CopyWatcher.sections = [];
        }
    }

    private static watcher: vscode.FileSystemWatcher;

    private static startWatch() {
        CopyWatcher.consoleChannel.appendLine("Start watching...");

        this.watcher = vscode.workspace.createFileSystemWatcher("**/*", false, false, false);

        this.watcher.onDidChange((uri) => {
            // CopyWatcher.consoleChannel.appendLine(`file changed: ${uri.fsPath}`);
            for (let section of CopyWatcher.sections) {
                section.watcherFileChanged(uri.fsPath);
            }
        });
        this.watcher.onDidCreate((uri) => {
            // CopyWatcher.consoleChannel.appendLine(`file created: ${uri.fsPath}`);
            for (let section of CopyWatcher.sections) {
                section.watcherFileCreated(uri.fsPath);
            }
        });
        this.watcher.onDidDelete((uri) => {
            // CopyWatcher.consoleChannel.appendLine(`file deleted: ${uri.fsPath}`);
            for (let section of CopyWatcher.sections) {
                section.watcherFileDeleted(uri.fsPath);
            }
        });
    }
}

export function activate(context: vscode.ExtensionContext) {
    CopyWatcher.activate(context);
}

export function deactivate() {
    CopyWatcher.deactivate();
}
