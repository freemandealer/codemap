/* CodeMap teaching fixture. This is not Linux VFS code.
 * One static file slot, no concurrency, no descriptor table, no real paths.
 */
#include <stddef.h>

struct Inode { int readable; };
struct File;
struct FileOps { int (*open)(struct File *file); };
struct File {
    struct Inode *inode;
    const struct FileOps *ops;
    int ready;
};

static struct Inode demo_inode = {1};
static struct File file_slot;
static int backend_failure;

static int backend_open(struct File *file)
{
    if (backend_failure)
        return -5;
    file->ready = 1;
    return 0;
}

static const struct FileOps backend_ops = {backend_open};

static struct Inode *lookup_inode(const char *path)
{
    if (path == NULL || path[0] == '\0')
        return NULL;
    return &demo_inode;
}

static struct File *allocate_file(struct Inode *inode)
{
    if (file_slot.inode != NULL)
        return NULL;
    file_slot.inode = inode;
    file_slot.ops = &backend_ops;
    file_slot.ready = 0;
    return &file_slot;
}

static void release_file(struct File *file)
{
    file->inode = NULL;
    file->ops = NULL;
    file->ready = 0;
}

static void audit_open(const char *path)
{
    (void)path; /* Deliberately side-effect free in this fixture. */
}

int minifs_open(const char *path, struct File **out)
{
    if (out == NULL)
        return -22;
    *out = NULL;
    audit_open(path);
    struct Inode *inode = lookup_inode(path);
    if (inode == NULL)
        return -2;
    if (!inode->readable)
        return -13;
    struct File *file = allocate_file(inode);
    if (file == NULL)
        return -12;
    int rc = file->ops->open(file);
    if (rc < 0) {
        release_file(file);
        return rc;
    }
    *out = file;
    return 0;
}
