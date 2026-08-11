/** Flatten zod issues into short `path: message` strings for error details. */
export function formatIssues(error) {
    return error.issues.map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join('.') : '<root>';
        return `${path}: ${issue.message}`;
    });
}
//# sourceMappingURL=validate.js.map