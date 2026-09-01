export function formatAcademicProgram(program: {
  name: string;
  credential: string;
}): string {
  return `${program.name} (${program.credential})`;
}
