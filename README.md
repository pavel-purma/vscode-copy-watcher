# vscode-copy-watcher README

Continuously watch for file changes and copy all modified files to defined mirror directory. 

## Features

Mirror copy changes from defined project folder to other destination.
It's handy for develop components inside big complex project and update it's sources.


## Requirements

It is built on npm cpx

## Extension Settings

This extension contributes the following settings:

* `copyWatcher.paths`: list of copy and watch definitions (source and destination)

Example:
```
"copyWatcher.paths": [
    {
        "source": "./Components/Component/**/*.js",
        "destination": "../../ComponentDevelopPlace/Component"
    }
]
```

## Contribution

Fork the [repository](https://github.com/pavel-purma/vscode-copy-watcher) and submit pull requests.


## Release Notes

### 1.0.0

Initial release
