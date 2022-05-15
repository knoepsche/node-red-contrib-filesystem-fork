module.exports = function (RED) {
    'use strict';

    const fs = require('fs');
    const fse = require('fs-extra');
    const os = require('os');
    const path = require('path');
    const util = require('util');
    const glob = require('fast-glob');

    var magic;
    try {
        magic = require('mmmagic');
    } catch(ignore) {};

    function getProperty(property, type, node, msg) {
        return RED.util.evaluateNodeProperty(property, type, node, msg) || '';
    }

    function setProperty(value, property, type, node, msg) {
        switch (type) {
            case 'msg':
                RED.util.setMessageProperty(msg, property, value, true);
                break;
            case 'flow':
            case 'global':
                node.context()[type].set(property, value);
                break;
            default:
                node.error(util.format(RED._('fs.error.property'), type), msg);
        }
    }

    function hasWildCard(filename) {
        return filename.indexOf('*') !== -1 ||
               filename.indexOf('?') !== -1 ||
               (filename.indexOf('[') !== -1 && filename.indexOf(']') !== -1) ||
               (filename.indexOf('{') !== -1 && filename.indexOf('}') !== -1);
    }

    function startOper(node, oper) {
        node.status({fill: 'blue', shape: 'dot', text: RED._(oper)});
    }

    function finishOperOk(node, msg) {
        node.send(msg);
        node.status({});
    }

   function finishOperFail(node, msg, errKey, errDetail, ...args) {
       node.status({fill: 'red', shape: 'dot', text: RED._('fs.status.failed')});
       node.error(util.format(RED._(errKey), ...args) + (errDetail ? RED._('fs.error.sep') + errDetail : ''), msg);
   }

    function FSCopyMoveNode(n) {
        RED.nodes.createNode(this, n);
        var node = this;

        node.srcPath = n.srcPath;
        node.srcPathType = n.srcPathType;
        node.srcFilename = n.srcFilename;
        node.srcFilenameType = n.srcFilenameType;
        node.dstPath = n.dstPath;
        node.dstPathType = n.dstPathType;
        node.dstFilename = n.dstFilename;
        node.dstFilenameType = n.dstFilenameType;
        node.overwrite = n.overwrite;
        node.oper = n.oper;

        node.operation = {
            'cp': function (src, dst, overwrite) {
                      return new Promise((resolve, reject) => {
                          fs.promises.stat(src).then((stat) => {
                              if (stat.isDirectory()) {
									fse.copy(src, dst, {overwrite:overwrite, errorOnExist:true})
                                      .then(() => resolve())
                                      .catch((e) => reject(e));
                              } else {
                                  if (dst.slice(-1) === path.sep)
                                      dst = path.join(dst, path.basename(src));
                                  fs.promises.copyFile(src, dst, overwrite?0:fs.constants.COPYFILE_EXCL)
                                      .then(() => resolve())
                                      .catch((e) => reject(e));
                              }
                          }).catch((e) => reject(e));
                      })
                  },
            'mv': function (src, dst, overwrite) {
                      if (dst.slice(-1) === path.sep)
                          dst = path.join(dst, path.basename(src));
                      return fse.move(src, dst, {overwrite: overwrite});
                  },
            'ln': function (src, dst, overwrite) {
                      return new Promise((resolve, reject) => {
                          if (dst.slice(-1) === path.sep)
                              dst = path.join(dst, path.basename(src));
                          (overwrite ? fs.promises.rm(dst, {force: true, recursive: true}) : Promise.resolve())
                              .then(() => fs.promises.symlink(src, dst))
                              .then(() => resolve())
                              .catch((e) => reject(e));
                      });
                  }
        }[n.oper];

        this.on('input', (msg) => {
            startOper(node, 'fs-copy-move.status.running-' + node.oper);

            let srcFilename = RED.util.evaluateNodeProperty(node.srcFilename, node.srcFilenameType, node, msg);
            if (!path.isAbsolute(srcFilename)) {
                srcFilename = path.join(RED.util.evaluateNodeProperty(node.srcPath, node.srcPathType, node, msg), srcFilename);
            }
            if (!srcFilename) {
                finishOperFail(node, msg, 'fs-copy-move.error.empty');
                return;
            }

            let dstFilename = RED.util.evaluateNodeProperty(node.dstFilename, node.dstFilenameType, node, msg);
            if (!path.isAbsolute(dstFilename)) {
                dstFilename = path.join(RED.util.evaluateNodeProperty(node.dstPath, node.dstPathType, node, msg), dstFilename);
            }

            if (hasWildCard(srcFilename)) {
                glob(srcFilename, {dot: false, onlyFiles: false, onlyDirectories: false, followSymbolicLinks: false}).then((files) => {
                    files.reduce((p, f) => { return p
                        .then(() => { return node.operation(f, dstFilename, node.overwrite) })
                        .catch((e) => finishOperFail(node, msg, 'fs-copy-move.error.failed-' + node.oper, err.message, f));
                    }, Promise.resolve())
                        .then(() => finishOperOk(node, msg));
                }).catch((err) => {
                    finishOperFail(node, msg, 'fs-copy-move.error.pattern', err.message);
                });
            } else {
                node.operation(srcFilename, dstFilename, node.overwrite)
                    .then(() => finishOperOk(node, msg))
                    .catch((err) => finishOperFail(node, msg, 'fs-copy-move.error.failed-' + node.oper, err.message, srcFilename));
            }
        });
    }

    function FSRemoveNode(n) {
        RED.nodes.createNode(this, n);
        var node = this;

        node.path = n.path;
        node.pathType = n.pathType;
        node.filename = n.filename;
        node.filenameType = n.filenameType;
        node.recursive = n.recursive;
        node.force = !n.exist;

        function remove(target, force, recursive) {
            return new Promise((resolve, reject) => {
                fs.promises.stat(target).then((stat) => {
                    if (stat.isDirectory()) {
                        fs.promises.readdir(target).then((content) => {
                            (content.length == 0 || !recursive ?
                                fs.promises.rmdir(target, {force: force, recursive: false}) :
                                fs.promises.rm(target, {force: force, recursive: true}))
                            .then(() => resolve())
                            .catch((e) => reject(e));
                        })
                    } else {
                        fs.promises.rm(target, {force: force, recursive: false})
                            .then(() => resolve())
                            .catch((e) => reject(e));
                    }
                }).catch((e) => {
                    if (e.code === 'ENOENT' && force) resolve();
                    else reject(e);
                });
            })
        }

        this.on('input', (msg) => {
            startOper(node, 'fs-remove.status.running');

            let filename = RED.util.evaluateNodeProperty(node.filename, node.filenameType, node, msg);
            if (!path.isAbsolute(filename))
                filename = path.join(RED.util.evaluateNodeProperty(node.path, node.pathType, node, msg), filename);

            if (!filename) {
                finishOperFail(node, msg, 'fs-remove.error.empty');
                return;
            }

            if (hasWildCard(filename)) {

                glob(filename, {dot: false, onlyFiles: false, onlyDirectories: false, followSymbolicLinks: false}).then((files) => {
                    if (files.length == 0 && !node.force) {
                        finishOperFail(node, msg, 'fs-remove.error.notexists', undefined, filename);
                    } else {
                        files.reverse().reduce((p, f) => { return p
                            .then(() => { return remove(f, node.force, node.recursive) })
                            .catch((err) => finishOperFail(node, msg, 'fs-remove.error.failed', err.message, f));
                        }, Promise.resolve())
                            .then(() => finishOperOk(node, msg));
                    }
                }).catch((err) => {
                    finishOperFail(node, msg, 'fs-remove.error.pattern', err.message);
                });

            } else {
                remove(filename, node.force, node.recursive)
                    .then(() => finishOperOk(node, msg))
                    .catch((err) => finishOperFail(node, msg, 'fs-remove.error.failed', err.message, filename));
            }
        });
    }

    function FSMkdirNode(n) {
        RED.nodes.createNode(this, n);
        var node = this;

        node.purpose = n.purpose;
        node.path = n.path;
        node.pathType = n.pathType;
        node.foldername = n.foldername;
        node.foldernameType = n.foldernameType;
        node.recursive = Boolean(n.recursive);
        node.exists = Boolean(n.exists);
        node.prefix = n.prefix;
        node.prefixType = n.prefixType;
        node.mode = parseInt(n.mode, 8);
        node.modeType = n.modeType;
        node.property = n.property;
        node.propertyType = n.propertyType;

        this.on('input', (msg) => {
            startOper(node, 'fs-mkdir.status.running');

            switch (node.purpose) {

                case 'reg':
                    let foldername = RED.util.evaluateNodeProperty(node.foldername, node.foldernameType, node, msg);
                    if (!path.isAbsolute(foldername)) {
                        foldername = path.join(RED.util.evaluateNodeProperty(node.path, node.pathType, node, msg), foldername);
                    }

                    (node.exists ? fs.promises.access(foldername) : Promise.reject()).then(() => {
                        finishOperFail(node, msg, 'fs-mkdir.error.exists', undefined, foldername)
                    }).catch((err) => {
                        fs.promises.mkdir(foldername, {recursive: node.recursive, mode: node.mode}).then(() => {
                            setProperty(foldername, node.property, node.propertyType, node, msg);
                            finishOperOk(node, msg);
                        }).catch((err) => {
                            if (err.code === 'EEXIST' && !node.exists) {
                                setProperty(foldername, node.property, node.propertyType, node, msg);
                                finishOperOk(node, msg);
                            } else {
                                finishOperFail(node, msg, 'fs-mkdir.error.failed-reg', err.message)
                            }
                        });
                    });

                    break;

                case 'tmp':
                    let prefix = RED.util.evaluateNodeProperty(node.prefix, node.prefixType, node, msg);
                    let p = RED.util.evaluateNodeProperty(node.path, node.pathType, node, msg)
                    if (!path.isAbsolute(prefix) && p) {
                        if (p.slice(-1) != path.sep) {
                            p += path.sep;
                        }
                        prefix = path.join(p, prefix);
                    }
                    if (!prefix) {
                        prefix = os.tmpdir + path.sep;
                    } else if (!path.isAbsolute(prefix)) {
                        prefix = path.join(os.tmpdir(), prefix);
                    }

                    let promise;
                    if (node.recursive) {
                        let f = prefix.slice(-1) == path.sep ? prefix : path.parse(prefix).dir;
                        promise = fs.promises.mkdir(f, {recursive: true, mode: 0o700});
                    } else {
                        promise = Promise.resolve();
                    }
                    promise
                        .then(() => fs.promises.mkdtemp(prefix))
                        .then((folder) => {
                            setProperty(folder, node.property, node.propertyType, node, msg);
                            finishOperOk(node, msg);
                        })
                        .catch((err) => finishOperFail(node, msg, 'fs-mkdir.error.failed-tmp', err.message));

            }
        });
    }

    function FSListNode(n) {
        RED.nodes.createNode(this, n);
        var node = this;

        node.path = n.path;
        node.pathType = n.pathType;
        node.pattern = n.pattern;
        node.patternType = n.patternType;
        node.filter = n.filter;
        node.recursive = n.recursive;
        node.follow = n.follow;
        node.property = n.property;
        node.propertyType = n.propertyType;

        this.on('input', (msg) => {
            startOper(node, 'fs-list.status.running');

            let folder = getProperty(node.path, node.pathType, node, msg) || '.';

            let pattern = getProperty(node.pattern, node.patternType, node, msg);
            if (pattern.indexOf(path.sep) !== -1) {
                finishOperFail(node, msg, 'fs-list.error.pattern', undefined, path.sep);
                return;
            }
            fs.promises.stat(folder).then((stat) => {
                if (stat.isDirectory()) {
                    glob(node.recursive ? '**/' + pattern : pattern,
                         {dot: true, onlyFiles: node.filter=='files', onlyDirectories: node.filter=='folders', followSymbolicLinks: node.follow, cwd: folder})
                        .then((files) => {
                            setProperty(files, node.property, node.propertyType, node, msg);
                            finishOperOk(node, msg);
                        })
                        .catch((err) => {
                            finishOperFail(node, msg, 'fs-list.error.failed', err.message, pattern, folder);
                        });
                } else {
                    finishOperFail(node, msg, 'fs-list.error.notfolder', undefined, folder);
                }
            }).catch((err) => {
                finishOperFail(node, msg, 'fs-list.error.failed', err.message, pattern, folder);
            });
        });
    }

    function FSStatsNode(n) {
        RED.nodes.createNode(this, n);
        var node = this;

        node.path = n.path;
        node.pathType = n.pathType;
        node.filename = n.filename;
        node.filenameType = n.filenameType;
        node.attr = n.attr;
        node.follow = n.follow;
        node.property = n.property;
        node.propertyType = n.propertyType;

        var kinds = {};
        kinds[fs.constants.S_IFREG]  = 'file';
        kinds[fs.constants.S_IFDIR]  = 'folder';
        kinds[fs.constants.S_IFCHR]  = 'character';
        kinds[fs.constants.S_IFBLK]  = 'block';
        kinds[fs.constants.S_IFFIFO] = 'pipe';
        kinds[fs.constants.S_IFLNK]  = 'link';
        kinds[fs.constants.S_IFSOCK] = 'socket';

        function toRights(number) {
            let chars = {0:'-', 1: 'x', 2: 'w', 4: 'r'};
            return (chars[number & 4] + chars[number & 2] + chars[number & 1]);
        }

        this.on('input', (msg) => {
            startOper(node, 'fs-stats.status.running');

            let filename = getProperty(node.filename, node.filenameType, node, msg);
            if (!path.isAbsolute(filename)) {
                filename = path.join(getProperty(node.path, node.pathType, node, msg), filename);
            }

            let stat = (node.follow ? fs.promises.stat : fs.promises.lstat);

            stat(filename).then((stats) => {
                function sendStat(err, result) {
                    if (err) {
                        finishOperFail(node, msg, 'fs-stats.error.failed', err.message, filename);
                        return;
                    }
                    if (result) {
                        stats.mime = result;
                    }
                    if (node.attr && node.attr !== 'basic') {
                        stats = stats[node.attr];
                    }
                    setProperty(stats, node.property, node.propertyType, node, msg);
                    finishOperOk(node, msg);
                }

                if (node.attr !== 'basic') {
                    stats.kind = kinds[stats.mode & fs.constants.S_IFMT];
                    stats.rights = toRights(stats.mode >> 6 & 7) + toRights(stats.mode >> 3 & 7) + toRights(stats.mode & 7);
                    stats.mode = stats.mode.toString(8);
                }
                if (magic && (node.attr === '' || node.attr === 'mime')) {
                    let m = new magic.Magic(magic.MAGIC_MIME_TYPE | (node.follow ? magic.MAGIC_SYMLINK : magic.MAGIC_NONE));
                    m.detectFile(filename, sendStat);
                } else {
                    sendStat(undefined, undefined);
                }
            }).catch((err) => {
                finishOperFail(node, msg, 'fs-stats.error.failed', err.message, filename);
            });
        });
    }

    function FSAccessNode(n) {
        RED.nodes.createNode(this, n);
        var node = this;

        node.path = n.path;
        node.pathType = n.pathType;
        node.filename = n.filename;
        node.filenameType = n.filenameType;
        node.mode = (n.accessRead ? fs.constants.R_OK : 0) | (n.accessWrite ? fs.constants.W_OK : 0);

        this.on('input', (msg) => {
            startOper(node, 'fs-access.status.running');

            let filename = getProperty(node.filename, node.filenameType, node, msg);
            if (!path.isAbsolute(filename)) {
                filename = path.join(getProperty(node.path, node.pathType, node, msg), filename);
            }

           fs.promises.access(filename, node.mode)
               .then(() => { node.send([msg, undefined]); node.status({}); })
               .catch((e) => { node.send([undefined, msg]); node.status({}); });
        });
    }

    RED.nodes.registerType('fs-copy-move', FSCopyMoveNode);
    RED.nodes.registerType('fs-remove', FSRemoveNode);
    RED.nodes.registerType('fs-mkdir', FSMkdirNode);
    RED.nodes.registerType('fs-list', FSListNode);
    RED.nodes.registerType('fs-stats', FSStatsNode);
    RED.nodes.registerType('fs-access', FSAccessNode);
}
