import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
const cpx = require("cpx");


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
            exec_cpx(channel, item.source, item.destination, item.destinationRequired || true, item.initialCopy || false);
        }
    }
}

export function deactivate() {
}

function exec_cpx(channel: vscode.OutputChannel, source: string, destination: string, destinationRequired: boolean, initialCopy: boolean) {
    if (!source || source == '') {
        return;
    }
    if (!destination || destination == '') {
        return;
    }
    let srcPath = path.resolve(vscode.workspace.rootPath, source);
    let dstPath = path.resolve(vscode.workspace.rootPath, destination);

    if (destinationRequired && !fs.existsSync(dstPath)) {
        channel.appendLine(`Destination '${destination}' does not exist. CopyWatcher not activated for this destination folder.`);
        return;
    }

    const cpxWather = cpx.watch(srcPath, dstPath, { update: true, initialCopy: initialCopy });

    cpxWather.on("copy", (e) => {
        let srcPath = path.normalize(path.resolve(vscode.workspace.rootPath, e.srcPath));
        // srcPath = path.relative(vscode.workspace.rootPath, srcPath);
        srcPath = path.basename(srcPath);

        let dstPath = path.normalize(path.resolve(vscode.workspace.rootPath, e.dstPath));

        channel.appendLine(`Copy ${srcPath} => ${dstPath}`);
    });

    cpxWather.on("remove", (e) => {
        channel.appendLine(`Remove ${e.path}`);
    });

    cpxWather.on("watch-ready", (e) => {
        channel.appendLine(`Start watching copy from '${source}' to '${destination}'`);
    });

    cpxWather.on("watch-error", (e) => {
        channel.appendLine(`Error:\r\n${e}`);
    });
}

