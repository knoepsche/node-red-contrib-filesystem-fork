# Fork of node-red-contrib-filesystem

The original version gives error messages when copying files. This has been noticed with Node-Red on Windows. This fork fixes the problem:

Here will
fs.promises.copyFile
and
fse.copy
used
instead of
fs.promises.cp

otherwise everything works as in the original version:

https://www.npmjs.com/package/node-red-contrib-filesystem

https://gitlab.com/advantech-czech/node-red-contrib-filesystem
