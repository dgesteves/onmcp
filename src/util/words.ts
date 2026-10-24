/**
 * The words of a name, in lowercase, however it's written: delete_file, deleteFile, delete-file,
 * files.delete and HTTPDelete.
 */
export function words(name: string): string[] {
  return name
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z\d]+/)
    .filter(Boolean);
}
