# Fork of node-red-contrib-filesystem

The original version gives error messages when copying files. This has been noticed with Node-Red on Windows. This fork fixes the problem:

Here will
fs.promises.copyFile
and
fse.copy
used
instead of
fs.promises.cp

# Filesystem Operations for Node-RED

The node-red-contrib-fs is a set of Node-RED nodes for work with the filesystem. The following nodes are available:

![fs copy/move/link](https://gitlab.com/advantech-czech/node-red-contrib-filesystem/-/raw/1.0.0/images/fs-copy-move-link.svg) Copies or moves files and folders or creates links to them.  
![fs copy/move/link](https://gitlab.com/advantech-czech/node-red-contrib-filesystem/-/raw/1.0.0/images/fs-remove.svg) Deletes files and folders.  
![fs copy/move/link](https://gitlab.com/advantech-czech/node-red-contrib-filesystem/-/raw/1.0.0/images/fs-mkdir.svg) Creates folders.  
![fs copy/move/link](https://gitlab.com/advantech-czech/node-red-contrib-filesystem/-/raw/1.0.0/images/fs-list.svg) Lists content of a folder.  
![fs copy/move/link](https://gitlab.com/advantech-czech/node-red-contrib-filesystem/-/raw/1.0.0/images/fs-stats.svg) Provides details about a file or folder.  
![fs copy/move/link](https://gitlab.com/advantech-czech/node-red-contrib-filesystem/-/raw/1.0.0/images/fs-access.svg) Tests if a file or folder is visible, readable or writeable for your flow.

## Common Description

Most of the FS nodes have a **Path** and **Filename** property which offer very flexible specification of the file you want to use. The user can provide both values as a message, flow or global property, or as a string, or as an environment variable. If the filename is relative, the node combines path and filename together. It is possible to omit path and provide the full specification only in filename. If the filename is relative in this case then the current working folder is used as the path (except creating temporary folder, see FS Make Folder). Examples:

Path: /foo  
Filename: bar.txt  
/foo/bar.txt

Path: /foo  
Filename: /other/bar.txt  
/other/bar.txt

Path: /foo/  
Filename:  
/foo/

Path:  
Filename: bar.txt  
./bar.txt

All nodes, excpet the FS Access node, produce common Node-RED errors when they meet a problem, therefore it is possible to use the catch node to process errors.

## FS Copy/Move/Link Node

Use this node when you need to copy or move file(s) or folder(s), or you need to create a symlink to them.

![The editor form for FS Copy/Move/Link node](https://gitlab.com/advantech-czech/node-red-contrib-filesystem/-/raw/1.0.0/images/fs-copy-move-link.png)

**Operation** specifies which filesystem operation to use. All operations have the same parameters. **Src Path** and **Src Filename** say what is the source of the selected operation. The standard globbing wild cards `*`, `?`, `[]` and `{}` are allowd. **Dest Path** and **Dest Filename** say what is the source of the selected operation. If you need to say explicitly that the destination is a folder, please add a folder separator to the end. See path and filename rules in the Common Description section.

If **Overwrite dest** is checked and the target file alread exists, it will be silently replaced. Otherwise the operation will cause an exception. A folder can not be overwritten. It will cause an exception everytime, regardles of the state of this option. The reason is that this is a dangerous operation. You can accidentaly destroy a large folder tree.

If it is necessary, the missing folders in the destination folder will be created.

## FS Remove Node

Use this node if you need to remove file(s) or folder(s).

![The editor form for FS Remove node](https://gitlab.com/advantech-czech/node-red-contrib-filesystem/-/raw/1.0.0/images/fs-remove.png)

**Path** and **Filename** fields say which file or folder you want to remove. See path and filename rules in the Common Description section. It is possible to use the globbing wild cards to delete multiple targets.

The **Recursive** option allows to delete a not empty folders. If it is not checked and removing requirest to remove not empty folder, a Node-RED error will be produced.

If **Must Exist** is checked and the target does not exist, it will produce a Node-RED error. If it is not checked, the unexisting target is silently ignored.

## FS MkDir Node

Use this node if you need to create a folder.

![The editor form for FS MkDir node, in regular folder settings](https://gitlab.com/advantech-czech/node-red-contrib-filesystem/-/raw/1.0.0/images/fs-mkdir-regular.png)

**Path** and **Foldername** fields say which file or folder you want to create. See path and filename rules in the Common Description section. It is possible to create several levels of folders with the **Recursive** option.

If **Error on Exist** is checked and the folder with the requested name already exists, it will cause a Node-RED error. If it is unchecked, the issue is silently ignored.

The **Mode** field must contain Linux access rights in the octal form.

![The editor form for FS MkDir node, in temporary folder settings](https://gitlab.com/advantech-czech/node-red-contrib-filesystem/-/raw/1.0.0/images/fs-mkdir-temporary.png)

When you need a temporary folder with a unique name, switch **Purpose** switcher from *regular* to *temporary*. Now you can set **Name Prefix** instead of **Foldername** (it is not mandatory). The newly created folder will get a auto-generated unique name prefixed with your **Name Prefix**.

If the path specification of the temporary folder is relative then the folder will be created in the system temporary folder (usualy /tmp or /var/tmp). It is different compared to all other path specifications which relate to the working folder.

You can choose where you want to store the resultant name with the **Result Property** field. It works for both the regular and temporary folder. However it is useful for the temporary folder only, as you the new folder name is random.

## FS List Node

Use this node if you need to get the list of a folder content.

![The editor form for FS List node](https://gitlab.com/advantech-czech/node-red-contrib-filesystem/-/raw/1.0.0/images/fs-list.png)

You can limit listed content with **Pattern** and **Filter** fields. The pattern can contain the standard globbing wild cards `*`, `?`, `[]` and `{}`. The filter can limit result to only files or folders.

Be careful with **Recursive** and **Follow Links** options. The checked **Recursive** check box causes the node to search the whole folder tree. This, additionaly with the following links, can produece many results.

The resultant list is returned as a JavaScript Array and **Result Property** specifies where to store it.

## FS Stats Node

Use this node when you need to know additional information about a file or folder.

![The editor form for FS Stats node](https://gitlab.com/advantech-czech/node-red-contrib-filesystem/-/raw/1.0.0/images/fs-stats.png)

The **Path** and **Filename** field say for which file or folder for you want to get details. See path and filename rules in the Common Description section.

You can select *All* (or *All Basic*) details or just a single detail with the **Attributes** dropdown. The *All Basic* options selects only details directly returned by the Node.js (resp. POSIX) function stat(). The *All* option provides some extended details, namely: *Kind*, *Mode*, *Rights* and *MIME Type*.

The *Kind* gives the following values: `file`, `folder`, `character` (device), `block` (device), `pipe`, `link`, `socket`. The *Mode* is an octal expression of file access mode and *Rights* is the same in textual expression (`rwxrwxrwx`). The timestamp strings have the ISO 8601 format, e.g. `2021-11-18T17:14:58.000Z`.

The MIME Type is only available when `mmmagic` dependency is installed. This dependecy is large due to MIME Type database, so it is optional. If it is not installed, the item is still in presented, but it returns `undefined` every time.

When **Follow Links** is checked, the node will probe a linked target, otherwise the link itself.

You can choose where to put the details with the **Result Property** dropdown. Result will be an Array for *All* or *All Basic* details, or a String or Number for a single detail.

## FS Access Node

Use this node when you need to know if your flow has access to a file or folder.

![The editor form for FS Access node](https://gitlab.com/advantech-czech/node-red-contrib-filesystem/-/raw/1.0.0/images/fs-access.png)

The **Path** and **Filename** field say which file or folder you want to test. See path and filename rules in the Common Description section.

The **Access** checkboxes specify the type of access to test. The *Write* access means modification of the content of the file. The *Read* access means reading the content of the file. When both are unchecked, the node will test only if flow can see the existence of file or folder. When a folder is tested, the *Read* access means to list content and *Write* access means to create/delete inside.

If a file is accessible according the given criteria, the untouched original message continues to the first output, otherwise to the second output. This node does not produce any error. An error means “unaccessible” and your flow continues on the second output.

## Usage Examples

The examples are available in the *examples* folder. You can import it directly from Node-RED.

## License

Node is pulished under MIT License. See *LICENSE* file.
