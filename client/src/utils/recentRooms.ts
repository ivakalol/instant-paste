const RECENT_ROOMS_KEY = 'recentRooms';
const MAX_RECENT_ROOMS = 5;

export const getRecentRooms = (): string[] => {
  try {
    const rooms = localStorage.getItem(RECENT_ROOMS_KEY);
    return rooms ? JSON.parse(rooms) : [];
  } catch (error) {
    console.error('Error reading recent rooms from localStorage', error);
    return [];
  }
};

export const addRecentRoom = (roomId: string) => {
  if (!roomId) return;
  try {
    let rooms = getRecentRooms();
    // Remove the room if it already exists to avoid duplicates and move it to the top
    rooms = rooms.filter(r => r !== roomId);
    // Add the new room to the beginning of the list
    rooms.unshift(roomId);
    // Trim the list to the maximum allowed size
    const trimmedRooms = rooms.slice(0, MAX_RECENT_ROOMS);
    localStorage.setItem(RECENT_ROOMS_KEY, JSON.stringify(trimmedRooms));
  } catch (error) {
    console.error('Error saving recent room to localStorage', error);
  }
};
