/**
 * Unsplash photo manifest for the dev seed.
 *
 * Every entry was checked to return 200 image/jpeg and was reviewed by eye so the
 * photo actually matches the place it is attached to (a fort photo on the fort
 * experience, a coffee photo on the cafe, and so on). Keys are used to build the
 * on-disk filename `seed-<key>.jpg`, so they must stay [a-z0-9-].
 *
 * `crop: 'faces'` asks the Unsplash CDN for a square face crop — used for avatars.
 * Content photos use a landscape crop at 1200x800.
 */

export interface UnsplashPhoto {
  /** Unsplash photo id, including the `photo-` prefix */
  id: string;
  width: number;
  height: number;
  crop?: 'faces';
}

const CDN = 'https://images.unsplash.com';

function src(id: string, width: number, height: number, crop?: 'faces'): UnsplashPhoto {
  return { id, width, height, ...(crop ? { crop } : {}) };
}

function avatar(id: string): UnsplashPhoto {
  return src(id, 320, 320, 'faces');
}

function wide(id: string): UnsplashPhoto {
  return src(id, 1200, 800);
}

export const PHOTOS = {
  // ---------- avatars (10 seed users) ----------
  'av-ahmed': avatar('photo-1500648767791-00dcc994a43e'),
  'av-sara': avatar('photo-1494790108377-be9c29b29330'),
  'av-bilal': avatar('photo-1547425260-76bcadfb4f2c'),
  'av-hamza': avatar('photo-1507003211169-0a1dd7228f2d'),
  'av-ayesha': avatar('photo-1544005313-94ddf0286df2'),
  'av-zainab': avatar('photo-1531123897727-8f129e1688ce'),
  'av-usman': avatar('photo-1519345182560-3f2917c472ef'),
  'av-kiran': avatar('photo-1506794778202-cad84cf45f1d'),
  'av-nadia': avatar('photo-1573496359142-b8d87734a5a2'),
  'av-omar': avatar('photo-1507591064344-4c6ce005b128'),
  'av-hey': avatar('photo-1601412436009-d964bd02edbc'),
  'av-something': avatar('photo-1599566150163-29194dcaad36'),

  // ---------- forts / historic / landmarks ----------
  'fort-petra': wide('photo-1599661046289-e31897846e41'),
  'fort-stone-ruins': wide('photo-1518638150340-f706e86654de'),
  'fort-colosseum-night': wide('photo-1552832230-c0197dd311b5'),
  'fort-archway': wide('photo-1548013146-72479768bada'),
  'fort-marble-pool': wide('photo-1564507592333-c60657eea523'),
  'fort-old-town-street': wide('photo-1467269204594-9661b134dd2b'),
  'fort-cliff-town': wide('photo-1516483638261-f4dbaf036963'),
  'landmark-city-sunset': wide('photo-1583417319070-4a69db38a482'),
  'landmark-mosque-dusk': wide('photo-1512632578888-169bbbc64f33'),

  // ---------- restaurant / food ----------
  'food-grilled-plate': wide('photo-1476224203421-9ac39bcb3327'),
  'food-steak-chilli': wide('photo-1504674900247-0877df9cc836'),
  'food-burger-table': wide('photo-1466978913421-dad2ebd01d17'),
  'food-brunch-spread': wide('photo-1424847651672-bf20a4b0982b'),
  'food-pizza-board': wide('photo-1565299624946-b28f40a0ae38'),
  'food-raspberry-cake': wide('photo-1565958011703-44f9829ba187'),
  'food-eggs-blue': wide('photo-1515003197210-e0cd71810b5f'),
  'food-plates-overhead': wide('photo-1533777324565-a040eb52facd'),
  'food-restaurant-dark': wide('photo-1517248135467-4c7edcad34c4'),
  'food-restaurant-bar': wide('photo-1552566626-52f8b828add9'),
  'food-terrace-seaside': wide('photo-1559339352-11d035aa65de'),

  // ---------- cafe / coffee ----------
  'cafe-two-lattes': wide('photo-1495474472287-4d71bcdd2085'),
  'cafe-pour-over': wide('photo-1442512595331-e89e73853f31'),
  'cafe-interior-plants': wide('photo-1554118811-1e0d58224f24'),
  'cafe-sign': wide('photo-1501339847302-ac426a4a7cbb'),
  'cafe-counter': wide('photo-1453614512568-c4024d13c247'),
  'cafe-latte-pour': wide('photo-1541167760496-1628856ab772'),
  'cafe-iced-coffee': wide('photo-1559496417-e7f25cb247f3'),
  'cafe-industrial': wide('photo-1521017432531-fbd92d768814'),

  // ---------- museum / gallery ----------
  'museum-gallery-wall': wide('photo-1554907984-15263bfd63bd'),
  'museum-classical-painting': wide('photo-1580136579312-94651dfd596d'),
  'museum-display-cases': wide('photo-1564399579883-451a5d44ec08'),

  // ---------- zoo / animals / birds ----------
  'zoo-elephant': wide('photo-1549366021-9f761d450615'),
  'zoo-elephant-forest': wide('photo-1557050543-4d5f4e07ef46'),
  'zoo-macaw-blue': wide('photo-1452570053594-1b985d6ea890'),
  'zoo-macaw-red': wide('photo-1546182990-dffeafbe841d'),
  'zoo-kingfisher': wide('photo-1444464666168-49d633b86797'),
  'zoo-giraffes': wide('photo-1534567153574-2b12153a87f0'),
  'zoo-toucan': wide('photo-1551085254-e96b210db58a'),
  'zoo-fox-snow': wide('photo-1474511320723-9a56873867b5'),
  'zoo-lion': wide('photo-1544923408-75c5cef46f14'),
  'zoo-panda': wide('photo-1564349683136-77e08dba1ef7'),

  // ---------- market / shopping ----------
  'market-veg-stall': wide('photo-1488459716781-31db52582fe9'),
  'market-clothing-rack': wide('photo-1555529669-e69e7aa0ba9a'),
  'market-alley-night': wide('photo-1533050487297-09b450131914'),
  'market-grocery-aisle': wide('photo-1534723452862-4c874018d66d'),
  'market-shop-interior': wide('photo-1441986300917-64674bd600d8'),

  // ---------- park / forest / garden ----------
  'park-forest-path': wide('photo-1441974231531-c6227db76b6e'),
  'park-forest-fog': wide('photo-1425913397330-cf8af2ff40a1'),
  'park-forest-dark': wide('photo-1448375240586-882707db888b'),
  'park-lone-tree': wide('photo-1502082553048-f009c37129b9'),
  'park-wooden-bridge': wide('photo-1447752875215-b2761acb3c5d'),

  // ---------- mountain / hiking ----------
  'mountain-snowy-peak': wide('photo-1454496522488-7a8e488e8606'),
  'mountain-peak-teal': wide('photo-1483728642387-6c3bdd6c93e5'),
  'mountain-valley-lake': wide('photo-1464822759023-fed622ff2c3b'),
  'mountain-hiker-trail': wide('photo-1551632811-561732d1e306'),
  'mountain-green-valley': wide('photo-1470071459604-3b5ec3a7fe05'),
  'mountain-starlit': wide('photo-1519681393784-d120267933ba'),
} as const satisfies Record<string, UnsplashPhoto>;

export type PhotoKey = keyof typeof PHOTOS;

/** Build a CDN url that returns a JPEG of the requested size. */
export function unsplashUrl(key: PhotoKey): string {
  const p = PHOTOS[key];
  const params = new URLSearchParams({
    w: String(p.width),
    h: String(p.height),
    q: '80',
    fm: 'jpg',
    fit: 'crop',
  });
  if (p.crop) params.set('crop', p.crop);
  return `${CDN}/${p.id}?${params.toString()}`;
}

/** On-disk name for a photo. Must match the avatarPath regex in modules/users.ts. */
export function photoFilename(key: PhotoKey): string {
  return `seed-${key}.jpg`;
}

/** Public URL the API serves the photo from. */
export function photoUrl(key: PhotoKey): string {
  return `/uploads/${photoFilename(key)}`;
}