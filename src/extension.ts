import * as vscode from 'vscode';
const cpx = require("cpx");


export function activate(context: vscode.ExtensionContext) {
    const config = vscode.workspace.getConfiguration('copyWatcher');    
    if (config && config.paths) { 
         const channel = vscode.window.createOutputChannel('Copy Watcher');
         channel.show();
        
        for (let i = 0; i < config.paths.length; ++i) { 
            const item = config.paths[i];
            exec_cpx(channel, item.source, item.target);
        }
    }   
}

export function deactivate() {
}

function exec_cpx(channel:vscode.OutputChannel, source:string, target:string) {       
    const emitter = cpx.watch(source, target);
    
    emitter.on("copy", (e) => {
        channel.appendLine(`Copy ${e.srcPath} ${e.dstPath}`);
    });

    emitter.on("remove", (e) => {
        channel.appendLine(`Remove ${e.path}`);
    });

    emitter.on("watch-ready", (e) => {
        channel.appendLine(`Start watching copy from '${source}' to '${target}' ...`);
    });

    emitter.on("watch-error", (e) => {
        channel.appendLine(`Error:\r\n${e}`);
    });
}

