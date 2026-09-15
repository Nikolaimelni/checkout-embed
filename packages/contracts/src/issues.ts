import type { z } from 'zod';

/** One line per problem, each with the path that caused it. */
export function describeIssues(error: z.ZodError): string[] {
  return error.issues.map(
    (issue) => `${issue.path.map(String).join('.') || '(root)'}: ${issue.message}`,
  );
}
