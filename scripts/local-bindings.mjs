// Shared by Vite and local setup so they use the same on-disk database.
export function localD1Bindings(binding) {
  return binding ? [{
    binding,
    database_name: 'site-creator-d1',
    database_id: '00000000-0000-4000-8000-000000000000',
  }] : [];
}
