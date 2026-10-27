import type { PhotoKey } from './unsplash';

/**
 * The dev dataset. It is designed so the social graph produces every relationship
 * level for the documented feed centre (34.015, 71.58):
 *
 *   ahmed  ↔ sara   →  direct_friend   ("Your Circle")
 *   sara   ↔ bilal  →  direct_friend
 *   ahmed  ↔ bilal  →  friend_of_friend ("Extended Circle")
 *   hamza / ayesha / omar → 'none'      ("Community")
 *
 * hamza, ayesha and omar only ever hold *pending* requests, so the three of them
 * stay Community-only exactly as docs/API.md describes.
 *
 * Photos come from a curated Unsplash manifest (scripts/unsplash.ts). An image can be
 * referenced by more than one experience when the places are of the same kind — every
 * fort post draws on the fort imagery — so the number of photo rows is larger than the
 * number of distinct files on disk.
 */

export interface SeedUser {
  key: string;
  email: string;
  name: string;
  bio: string;
  avatar: PhotoKey;
}

export interface SeedFriendship {
  from: string;
  to: string;
  status: 'accepted' | 'pending';
}

export interface SeedPlace {
  key: string;
  name: string;
  category: string;
  address: string;
  city: string;
  lat: number;
  lng: number;
  photos: PhotoKey[];
}

export interface SeedExperience {
  author: string;
  place: string;
  rating: number;
  review: string;
  visitedAt: string;
  visibility: 'circle' | 'extended' | 'community';
  /** Photo keys attached to this experience, in display order. */
  photos?: PhotoKey[];
}

export const PASSWORD = 'password123';

export const USERS: SeedUser[] = [
  { key: 'ahmed', email: 'ahmed@trust.dev', name: 'Ahmed Khan', bio: 'Born in Peshawar. Sunset chaser.', avatar: 'av-ahmed' },
  { key: 'sara', email: 'sara@trust.dev', name: 'Sara Ali', bio: 'Food, forts and long drives.', avatar: 'av-sara' },
  { key: 'bilal', email: 'bilal@trust.dev', name: 'Bilal Ahmed', bio: 'Museums over malls.', avatar: 'av-bilal' },
  { key: 'hamza', email: 'hamza@trust.dev', name: 'Hamza Shah', bio: 'Exploring one trail at a time.', avatar: 'av-hamza' },
  { key: 'ayesha', email: 'ayesha@trust.dev', name: 'Ayesha Khan', bio: 'Coffee first, everything else later.', avatar: 'av-ayesha' },
  { key: 'zainab', email: 'zainab@trust.dev', name: 'Zainab Iqbal', bio: 'Weekend markets and old bazaars.', avatar: 'av-zainab' },
  { key: 'usman', email: 'usman@trust.dev', name: 'Usman Tariq', bio: 'I have opinions about karahi.', avatar: 'av-usman' },
  { key: 'kiran', email: 'kiran@trust.dev', name: 'Kiran Shah', bio: 'Gallery nerd. Will queue for one painting.', avatar: 'av-kiran' },
  { key: 'nadia', email: 'nadia@trust.dev', name: 'Nadia Rehman', bio: 'Hiking is cheaper than therapy.', avatar: 'av-nadia' },
  { key: 'omar', email: 'omar@trust.dev', name: 'Omar Siddiqui', bio: 'Newly moved. Still hunting for good tea.', avatar: 'av-omar' },
  // The real accounts used from the app. They live in the seed so `db:seed` does not
  // silently delete them — it TRUNCATEs users CASCADE, so anything hand-created would
  // not survive a re-seed.
  { key: 'hey', email: 'hey@gmail.com', name: 'Hey', bio: 'New here — tell me where to go.', avatar: 'av-hey' },
  { key: 'something', email: 'something@gmail.com', name: 'Something', bio: 'Coffee, mostly.', avatar: 'av-something' },
];

export const FRIENDSHIPS: SeedFriendship[] = [
  // documented cluster
  { from: 'ahmed', to: 'sara', status: 'accepted' },
  { from: 'sara', to: 'bilal', status: 'accepted' },
  // second cluster — keeps hamza/ayesha/omar at Community
  { from: 'ahmed', to: 'usman', status: 'accepted' },
  { from: 'ahmed', to: 'zainab', status: 'accepted' },
  { from: 'sara', to: 'kiran', status: 'accepted' },
  { from: 'zainab', to: 'kiran', status: 'accepted' },
  { from: 'usman', to: 'nadia', status: 'accepted' },
  // pending — lets the app demo accept/decline without a second user acting
  { from: 'omar', to: 'hamza', status: 'pending' },
  { from: 'ayesha', to: 'sara', status: 'pending' },
  // the app's own accounts, so a fresh login is not an empty screen
  { from: 'hey', to: 'usman', status: 'accepted' },
  { from: 'something', to: 'sara', status: 'accepted' },
  { from: 'hey', to: 'hamza', status: 'pending' },
  { from: 'something', to: 'bilal', status: 'pending' },
];

export const PLACES: SeedPlace[] = [
  { key: 'fort', name: 'Bala Hisar Fort', category: 'landmark', address: 'Bala Hisar, Peshawar', city: 'Peshawar', lat: 34.0151, lng: 71.5805,
    photos: ['fort-petra', 'fort-stone-ruins', 'fort-colosseum-night', 'fort-archway'] },
  { key: 'khyber', name: 'Khyber Restaurant', category: 'restaurant', address: 'University Road, Peshawar', city: 'Peshawar', lat: 34.01, lng: 71.576,
    photos: ['food-grilled-plate', 'food-restaurant-dark', 'food-restaurant-bar'] },
  { key: 'coffee', name: 'Coffee Planet', category: 'cafe', address: 'Saddar Road, Peshawar', city: 'Peshawar', lat: 34.019, lng: 71.585,
    photos: ['cafe-two-lattes', 'cafe-pour-over', 'cafe-interior-plants', 'cafe-sign'] },
  { key: 'museum', name: 'Peshawar Museum', category: 'museum', address: 'Saddar, Peshawar', city: 'Peshawar', lat: 34.008, lng: 71.562,
    photos: ['museum-gallery-wall', 'museum-classical-painting', 'museum-display-cases'] },
  { key: 'zoo', name: 'Peshawar Zoo', category: 'park', address: 'Charsadda Road, Peshawar', city: 'Peshawar', lat: 34.048, lng: 71.58,
    photos: ['zoo-elephant', 'zoo-macaw-blue', 'zoo-kingfisher', 'zoo-giraffes', 'zoo-toucan'] },
  { key: 'nowshera', name: 'Nowshera Fort', category: 'landmark', address: 'Nowshera Cantt, Khyber Pakhtunkhwa', city: 'Nowshera', lat: 34.003, lng: 72.017,
    photos: ['fort-old-town-street', 'fort-colosseum-night'] },
  { key: 'faisal', name: 'Faisal Mosque', category: 'landmark', address: 'Faisal Mosque Rd, Islamabad', city: 'Islamabad', lat: 33.7295, lng: 73.037,
    photos: ['landmark-mosque-dusk', 'fort-marble-pool'] },

  { key: 'gulbahar', name: 'Gulbahar Park', category: 'park', address: 'Gulbahar, Peshawar', city: 'Peshawar', lat: 34.0085, lng: 71.559,
    photos: ['park-forest-path', 'park-lone-tree', 'park-wooden-bridge'] },
  { key: 'qissa', name: 'Qissa Khwani Bazaar', category: 'market', address: 'Qissa Khwani, Peshawar', city: 'Peshawar', lat: 34.0128, lng: 71.5732,
    photos: ['market-veg-stall', 'market-clothing-rack', 'market-alley-night'] },
  { key: 'namak', name: 'Namak Food Street', category: 'restaurant', address: 'Qissa Khwani Rd, Peshawar', city: 'Peshawar', lat: 34.0121, lng: 71.5744,
    photos: ['food-burger-table', 'food-brunch-spread', 'food-pizza-board', 'food-raspberry-cake'] },
  { key: 'charsadda', name: 'Charsadda Bazaar', category: 'market', address: 'Charsadda, Peshawar', city: 'Peshawar', lat: 34.045, lng: 71.572,
    photos: ['market-grocery-aisle', 'market-shop-interior', 'market-veg-stall'] },
  { key: 'upesh', name: 'University of Peshawar', category: 'education', address: 'University Road, Peshawar', city: 'Peshawar', lat: 34.0007, lng: 71.4873,
    photos: ['landmark-city-sunset', 'park-wooden-bridge'] },
  { key: 'saidu', name: 'Saidu Sharif', category: 'landmark', address: 'Saidu Sharif, Swat', city: 'Swat', lat: 34.69, lng: 72.35,
    photos: ['mountain-snowy-peak', 'mountain-hiker-trail'] },
  { key: 'nathia', name: 'Nathia Gali', category: 'hillstation', address: 'Abbottabad', city: 'Abbottabad', lat: 33.92, lng: 73.11,
    photos: ['mountain-peak-teal', 'mountain-valley-lake', 'park-forest-fog'] },
  { key: 'mansehra', name: 'Mansehra Lake', category: 'nature', address: 'Mansehra', city: 'Mansehra', lat: 34.51, lng: 72.84,
    photos: ['mountain-green-valley', 'park-forest-dark', 'mountain-starlit'] },
  { key: 'lahore', name: 'Lahore Fort', category: 'landmark', address: 'Lahore Cantt', city: 'Lahore', lat: 31.588, lng: 74.31,
    photos: ['fort-petra', 'fort-old-town-street', 'fort-cliff-town'] },
];

export const EXPERIENCES: SeedExperience[] = [
  // --- Ahmed @ Bala Hisar: one of each visibility, the visibility matrix's anchor
  { author: 'ahmed', place: 'fort', rating: 5, review: 'The view around sunset was incredible. Definitely worth visiting.', visitedAt: '2026-09-18', visibility: 'circle', photos: ['fort-petra', 'fort-archway'] },
  { author: 'ahmed', place: 'fort', rating: 5, review: 'Walk the whole rampart before dusk — the light on the old walls is unreal.', visitedAt: '2026-09-18', visibility: 'extended', photos: ['fort-stone-ruins', 'fort-colosseum-night'] },
  { author: 'ahmed', place: 'fort', rating: 4, review: 'Historic fort with great city views. Gets crowded on weekends.', visitedAt: '2026-08-22', visibility: 'community', photos: ['fort-petra'] },

  // --- Sara
  { author: 'sara', place: 'fort', rating: 5, review: 'Beautiful place with an amazing view. Go early to beat the heat.', visitedAt: '2026-09-12', visibility: 'community', photos: ['fort-marble-pool'] },
  { author: 'sara', place: 'khyber', rating: 5, review: 'The food was excellent. Try the BBQ platter and the chapli kebab.', visitedAt: '2026-09-05', visibility: 'circle', photos: ['food-grilled-plate', 'food-restaurant-dark'] },
  { author: 'sara', place: 'coffee', rating: 4, review: 'Quiet corner, good espresso. Wi-Fi is fast enough to actually work.', visitedAt: '2026-08-30', visibility: 'community', photos: ['cafe-latte-pour', 'cafe-interior-plants', 'cafe-counter'] },
  { author: 'sara', place: 'qissa', rating: 5, review: 'Lost in this bazaar for two hours. Spices, copper, and the best fruit stalls.', visitedAt: '2026-09-27', visibility: 'extended', photos: ['market-veg-stall', 'market-clothing-rack'] },
  { author: 'sara', place: 'namak', rating: 4, review: 'Crammed after 9pm. Get the seekh kebab and skip the queue at the first stall.', visitedAt: '2026-10-02', visibility: 'community', photos: ['food-burger-table', 'food-brunch-spread', 'food-eggs-blue'] },

  // --- Bilal
  { author: 'bilal', place: 'khyber', rating: 4, review: 'Really good food. Service was a little slow, but I would come back.', visitedAt: '2026-09-20', visibility: 'community', photos: ['food-steak-chilli'] },
  { author: 'bilal', place: 'museum', rating: 4, review: 'The Gandhara collection is world class. Give it at least an hour.', visitedAt: '2026-07-30', visibility: 'extended', photos: ['museum-gallery-wall', 'museum-classical-painting', 'museum-display-cases'] },
  { author: 'bilal', place: 'museum', rating: 5, review: 'Came for the stucco, stayed for the coin collection. Staff let me into the archive room.', visitedAt: '2026-09-25', visibility: 'circle', photos: ['museum-display-cases'] },
  { author: 'bilal', place: 'lahore', rating: 5, review: 'Sheesh Mahal at golden hour is the single best hour of light in the whole country.', visitedAt: '2026-06-14', visibility: 'community', photos: ['fort-petra', 'fort-old-town-street'] },

  // --- Hamza (Community only)
  { author: 'hamza', place: 'zoo', rating: 5, review: 'Surprisingly well maintained. Kids loved the aviary.', visitedAt: '2026-09-14', visibility: 'community', photos: ['zoo-kingfisher', 'zoo-macaw-blue', 'zoo-macaw-red'] },
  { author: 'hamza', place: 'fort', rating: 3, review: 'Nice history, but too many vendors inside for my taste.', visitedAt: '2026-08-10', visibility: 'community', photos: ['fort-stone-ruins'] },
  { author: 'hamza', place: 'nathia', rating: 5, review: 'Cold enough to wear a jacket in July. Absolutely worth the drive from Peshawar.', visitedAt: '2026-07-19', visibility: 'community', photos: ['mountain-peak-teal', 'mountain-valley-lake'] },
  { author: 'hamza', place: 'saidu', rating: 4, review: 'Started at the waterfall, ended at the fort. Take water — the trails are longer than they look.', visitedAt: '2026-08-28', visibility: 'extended', photos: ['mountain-hiker-trail', 'mountain-snowy-peak'] },

  // --- Ayesha (Community only)
  { author: 'ayesha', place: 'coffee', rating: 5, review: 'Best flat white in town. The window seat is prime real estate.', visitedAt: '2026-09-22', visibility: 'community', photos: ['cafe-two-lattes', 'cafe-sign', 'cafe-industrial'] },
  { author: 'ayesha', place: 'faisal', rating: 5, review: 'Sunset prayer at the mosque is a spiritual experience. Bring a scarf.', visitedAt: '2026-06-15', visibility: 'community', photos: ['landmark-mosque-dusk'] },
  { author: 'ayesha', place: 'namak', rating: 4, review: 'Dessert is the reason to go. The raspberry cake disappeared in four minutes flat.', visitedAt: '2026-10-03', visibility: 'community', photos: ['food-raspberry-cake', 'food-pizza-board'] },
  { author: 'ayesha', place: 'charsadda', rating: 4, review: 'Bargain hard, look relaxed. Half the shop is spices and the other half is fabric.', visitedAt: '2026-09-08', visibility: 'community', photos: ['market-grocery-aisle', 'market-shop-interior'] },

  // --- Ahmed, extended circle
  { author: 'ahmed', place: 'nowshera', rating: 4, review: 'Quick detour on the way up north — old barracks are worth a look.', visitedAt: '2026-07-12', visibility: 'community', photos: ['fort-old-town-street', 'fort-colosseum-night'] },
  { author: 'ahmed', place: 'museum', rating: 5, review: 'Went with my father and we stayed three hours. He still talks about the coins.', visitedAt: '2026-09-29', visibility: 'circle', photos: ['museum-classical-painting'] },
  { author: 'ahmed', place: 'gulbahar', rating: 4, review: 'Good quiet walk in the late afternoon. Watch out for the rollerbladers.', visitedAt: '2026-09-06', visibility: 'extended', photos: ['park-forest-path', 'park-lone-tree'] },

  // --- Usman
  { author: 'usman', place: 'khyber', rating: 5, review: 'The karahi is the reason I keep going back. Order it for two.', visitedAt: '2026-09-16', visibility: 'circle', photos: ['food-grilled-plate', 'food-restaurant-bar', 'food-terrace-seaside'] },
  { author: 'usman', place: 'namak', rating: 3, review: 'Great food, zero seating. You will eat standing up.', visitedAt: '2026-09-30', visibility: 'community', photos: ['food-plates-overhead'] },
  { author: 'usman', place: 'gulbahar', rating: 5, review: 'Best shaded loop in the city. I run it most evenings.', visitedAt: '2026-08-05', visibility: 'extended', photos: ['park-wooden-bridge', 'park-forest-dark'] },
  { author: 'usman', place: 'zoo', rating: 3, review: 'The elephants are worth it, the rest needs a refresh. Aviary was closed when I went.', visitedAt: '2026-07-25', visibility: 'community', photos: ['zoo-elephant', 'zoo-lion'] },

  // --- Zainab
  { author: 'zainab', place: 'qissa', rating: 5, review: 'My mother drags me here every Friday and I have stopped pretending to mind.', visitedAt: '2026-09-21', visibility: 'circle', photos: ['market-clothing-rack', 'market-alley-night'] },
  { author: 'zainab', place: 'charsadda', rating: 4, review: 'Oldest market in the region and it still beats the malls on everything.', visitedAt: '2026-09-02', visibility: 'extended', photos: ['market-veg-stall', 'market-grocery-aisle'] },
  { author: 'zainab', place: 'faisal', rating: 5, review: 'Go at maghrib. The whole courtyard turns gold and then everything goes quiet.', visitedAt: '2026-06-15', visibility: 'community', photos: ['landmark-mosque-dusk'] },
  { author: 'zainab', place: 'museum', rating: 4, review: 'The textile section is the underrated half. Go past the statues.', visitedAt: '2026-08-18', visibility: 'community', photos: ['museum-display-cases'] },

  // --- Kiran
  { author: 'kiran', place: 'museum', rating: 5, review: 'Spent two hours in front of one panel and would happily do it again.', visitedAt: '2026-09-11', visibility: 'circle', photos: ['museum-classical-painting', 'museum-gallery-wall'] },
  { author: 'kiran', place: 'lahore', rating: 4, review: 'Overwhelming in the best way. Give yourself a full day and a printed map.', visitedAt: '2026-06-20', visibility: 'extended', photos: ['fort-cliff-town'] },
  { author: 'kiran', place: 'upesh', rating: 4, review: 'The campus garden is unexpectedly quiet. Good place to read.', visitedAt: '2026-09-19', visibility: 'community', photos: ['landmark-city-sunset', 'park-wooden-bridge'] },

  // --- Nadia
  { author: 'nadia', place: 'saidu', rating: 5, review: 'Did this three times and it never gets old. Sunrise one is the best.', visitedAt: '2026-09-24', visibility: 'circle', photos: ['mountain-snowy-peak'] },
  { author: 'nadia', place: 'mansehra', rating: 5, review: 'Flat, easy walk around the lake. Perfect reset day.', visitedAt: '2026-09-13', visibility: 'extended', photos: ['mountain-green-valley', 'park-forest-dark'] },
  { author: 'nadia', place: 'nathia', rating: 4, review: 'Fog rolled in around noon and the whole ridge disappeared. Magical.', visitedAt: '2026-08-30', visibility: 'community', photos: ['park-forest-fog', 'mountain-starlit'] },
  { author: 'nadia', place: 'mansehra', rating: 5, review: 'Camped by the water. Watch the sky after 9pm.', visitedAt: '2026-07-28', visibility: 'circle', photos: ['mountain-starlit'] },

  // --- Omar (new to the city)
  { author: 'omar', place: 'coffee', rating: 4, review: 'First time here and the staff pointed me at the single origin. Good call.', visitedAt: '2026-10-01', visibility: 'community', photos: ['cafe-pour-over', 'cafe-iced-coffee'] },
  { author: 'omar', place: 'khyber', rating: 4, review: 'Everyone told me to come and everyone was right, which never happens.', visitedAt: '2026-09-28', visibility: 'community', photos: ['food-restaurant-dark'] },
  { author: 'omar', place: 'zoo', rating: 5, review: 'The giraffes came right up to the fence. The toucan was the star of the day.', visitedAt: '2026-09-27', visibility: 'community', photos: ['zoo-giraffes', 'zoo-toucan', 'zoo-elephant-forest', 'zoo-panda', 'zoo-fox-snow'] },
  { author: 'omar', place: 'fort', rating: 4, review: 'Second time writing about this fort and the opinion is only going up.', visitedAt: '2026-10-05', visibility: 'extended', photos: ['fort-colosseum-night', 'fort-archway'] },

  // --- Hey & Something: the accounts signed up through the app. They visit places
  // that OTHER users already posted about publicly, so shared-places suggestions and
  // the Circle screen have something to show on first login.
  { author: 'hey', place: 'zoo', rating: 4, review: 'Went on a weekday and it was half empty. Much better.', visitedAt: '2026-09-30', visibility: 'community', photos: ['zoo-elephant'] },
  { author: 'hey', place: 'fort', rating: 5, review: 'First time here and I get it now. Went twice in one week.', visitedAt: '2026-10-04', visibility: 'community', photos: ['fort-petra'] },
  { author: 'hey', place: 'coffee', rating: 4, review: 'Found this because someone I follow rated it. Was not disappointed.', visitedAt: '2026-10-06', visibility: 'community', photos: ['cafe-pour-over'] },
  { author: 'something', place: 'namak', rating: 4, review: 'The reviews said to skip the queue at the first stall. I did not skip it. Regret nothing.', visitedAt: '2026-09-28', visibility: 'community', photos: ['food-burger-table'] },
  { author: 'something', place: 'zoo', rating: 4, review: 'The aviary is the part worth the ticket.', visitedAt: '2026-10-01', visibility: 'community', photos: ['zoo-macaw-blue'] },
  { author: 'something', place: 'khyber', rating: 5, review: 'Every single person told me to come here. I finally did.', visitedAt: '2026-10-06', visibility: 'community', photos: ['food-grilled-plate'] },
];

/** Every photo key the dataset references, derived so nothing is missed or stale. */
export function referencedPhotoKeys(): PhotoKey[] {
  const keys = new Set<PhotoKey>(USERS.map((u) => u.avatar));
  for (const place of PLACES) for (const p of place.photos) keys.add(p);
  for (const exp of EXPERIENCES) for (const p of exp.photos ?? []) keys.add(p);
  return [...keys];
}