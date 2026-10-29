// Shops every new install starts with. Users can rename, recolor or delete
// any of them except Reminder and Unsorted, which the voice parser relies on.
export const COLORS = {
  blue: { bg: '#E3ECF9', fg: '#1D4E9E', label: 'Blue' },
  yellow: { bg: '#FDF0D9', fg: '#8A5A00', label: 'Yellow' },
  orange: { bg: '#FBE4DC', fg: '#9A3412', label: 'Orange' },
  green: { bg: '#E2F2EA', fg: '#1F6B4F', label: 'Green' },
  purple: { bg: '#EDE5F7', fg: '#5B3A8E', label: 'Purple' },
  grey: { bg: '#ECEFEC', fg: '#56625C', label: 'Grey' }
};

export const DEFAULT_SHOPS = [
  { id: 'costco', name: 'Costco', color: 'blue', aliases: ['cosco', 'costco wholesale'] },
  { id: 'walmart', name: 'Walmart', color: 'yellow', aliases: ['wallmart', 'wal mart', 'wal-mart'] },
  { id: 'target', name: 'Target', color: 'green', aliases: [] },
  { id: 'amazon', name: 'Amazon', color: 'orange', aliases: ['online'] },
  { id: 'kroger', name: 'Kroger', color: 'purple', aliases: ['croger', 'krogers'] },
  { id: 'publix', name: 'Publix', color: 'green', aliases: ['publics'] },
  { id: 'reminder', name: 'Reminder', color: 'purple', aliases: ['reminders', 'remind me', 'remember'], system: true },
  { id: 'unsorted', name: 'Unsorted', color: 'grey', aliases: [], system: true }
];
