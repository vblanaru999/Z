export function Banner({ error, notice }: { error?: string; notice?: string }) {
  if (error) {
    return (
      <p className="banner bad" role="alert">
        {error}
      </p>
    );
  }
  if (notice) {
    return (
      <p className="banner good" role="status">
        {notice}
      </p>
    );
  }
  return null;
}
