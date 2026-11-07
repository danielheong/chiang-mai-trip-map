// Place data for the Chiang Mai Trip Map.
// Coordinates for built-in places are approximate (good to within a block or so).

// Each category has a small hand-painted illustration (48×48 viewBox). Drawn for this
// map: guesthouse, Lanna temple, khao soi, coffee, market stall, Doi Suthep, martini
// glass and a quiet little flower for anything unsorted. Rendered through the #wc watercolor filter in index.html.
const K = 'stroke="#4A4036" stroke-width="1.3" stroke-linejoin="round" stroke-linecap="round"';
const N = 'fill="none" ' + K;
export const CATS = {
  stay: { label: 'Stay', art:
    `<path d="M5.5 23 24 9l18.5 14z" fill="#D9897A" ${K}/>
     <path d="M10 22.5h28V41H10z" fill="#F3D6CC" ${K}/>
     <path d="M21 41v-8a3.2 3.2 0 0 1 6.4 0v8" fill="#A57B63" ${K}/>
     <path d="M13.5 26.5h5v5h-5zM29.5 26.5h5v5h-5z" fill="#CFE3E6" ${K}/>
     <path d="M7 41h34" ${N}/>` },
  see: { label: 'Temple / Sight', short: 'Sight', art:
    `<path d="M24 3.5 26.4 13c3.6 1.4 4.6 4 4.6 7H17c0-3 1-5.6 4.6-7z" fill="#E7C064" ${K}/>
     <path d="M8 31 24 20.5 40 31z" fill="#E2B857" ${K}/>
     <path d="M12.5 25.5 24 16.5l11.5 9z" fill="#D9776A" ${K}/>
     <path d="M12.5 25.5c-2.4-.4-3.4-2.2-3-4.4M35.5 25.5c2.4-.4 3.4-2.2 3-4.4" ${N}/>
     <path d="M12 31h24v11H12z" fill="#F6ECDA" ${K}/>
     <path d="M21 42v-5.5a3 3 0 0 1 6 0V42" fill="#B8664F" ${K}/>
     <path d="M9.5 42h29" ${N}/>` },
  eat: { label: 'Eat', art:
    `<path d="M29 5 20.5 23M34 6.5 24 23" fill="none" stroke="#9C7660" stroke-width="2" stroke-linecap="round"/>
     <path d="M7.5 23.5C7.5 34 14 39.5 24 39.5S40.5 34 40.5 23.5z" fill="#9CC3C9" ${K}/>
     <path d="M12.5 30.5h23" fill="none" stroke="#F7EFE0" stroke-width="2" stroke-dasharray=".1 3.6" stroke-linecap="round"/>
     <ellipse cx="24" cy="23.5" rx="16.5" ry="4.4" fill="#EDB85C" ${K}/>
     <path d="M15.5 22.6c1.8-2.6 3.6-2.6 4.6 0 1.6-2.6 3.4-2.6 4.6 0" fill="none" stroke="#B98A3E" stroke-width="1.2" stroke-linecap="round"/>
     <circle cx="31.5" cy="22.4" r="2.2" fill="#B5CF7A" ${K}/>
     <path d="M18 39.5h12l-1.4 3h-9.2z" fill="#7FAEB5" ${K}/>` },
  cafe: { label: 'Café', art:
    `<path d="M19 4.5c-2.6 2.6-2.6 5 0 7.6s2.6 5 0 7.6M26 4.5c-2.6 2.6-2.6 5 0 7.6s2.6 5 0 7.6" fill="none" stroke="#B8AE9C" stroke-width="1.4" stroke-linecap="round"/>
     <ellipse cx="22.5" cy="40" rx="15.5" ry="3.2" fill="#CFE3E6" ${K}/>
     <path d="M11 20h23v9a9.5 9.5 0 0 1-9.5 9.5h-4A9.5 9.5 0 0 1 11 29z" fill="#F7EFE0" ${K}/>
     <path d="M11.2 24.5h22.6v4H11.2z" fill="#D98B7A"/>
     <path d="M11 20h23v9a9.5 9.5 0 0 1-9.5 9.5h-4A9.5 9.5 0 0 1 11 29z" ${N}/>
     <path d="M34 23h2.4a4.6 4.6 0 0 1 0 9.2H33" ${N}/>
     <ellipse cx="22.5" cy="20" rx="11.5" ry="2.6" fill="#9C7660" ${K}/>` },
  shop: { label: 'Shop / Market', short: 'Shop', art:
    `<path d="M11 21v20M37 21v20" ${N}/>
     <path d="M8.5 32h31v9h-31z" fill="#C49A7C" ${K}/>
     <circle cx="15" cy="29.6" r="2.6" fill="#E7A33E" ${K}/><circle cx="21" cy="29.6" r="2.6" fill="#D9776A" ${K}/>
     <circle cx="27" cy="29.6" r="2.6" fill="#B5CF7A" ${K}/><circle cx="33" cy="29.6" r="2.6" fill="#E7A33E" ${K}/>
     <path d="M7 11.5h34l-2 8.5H9z" fill="#F7EFE0" ${K}/>
     <path d="M7 11.5h6.8l-.6 8.5H9zM20.6 11.5h6.8V20h-6.8zM34.2 11.5H41l-2 8.5h-4.2z" fill="#E4A6C3"/>
     <path d="M7 11.5h34l-2 8.5H9z" ${N}/>
     <path d="M9 20q2.5 4 5 0 2.5 4 5 0 2.5 4 5 0 2.5 4 5 0 2.5 4 5 0 2.5 4 5 0" fill="#E4A6C3" ${K}/>` },
  nature: { label: 'Nature', art:
    `<path d="M3 40.5C9 26 13.5 19 18 19.5c3 .3 4.6 3 6 3.2 2.2-5.6 4.6-9.7 6.5-9.7 4 0 9.5 13 14.5 27.5z" fill="#8FAA72" ${K}/>
     <path d="M29.6 13.2l.9-4.4.9 4.4z" fill="#E2B857" stroke="#4A4036" stroke-width=".9" stroke-linejoin="round"/>
     <path d="M3 41.5c5-7 10-10.5 14-10.5s8.5 3.5 13 10.5z" fill="#B5CF7A" ${K}/>
     <path d="M38 41.5v-6.5" fill="none" stroke="#9C7660" stroke-width="1.8" stroke-linecap="round"/>
     <circle cx="38" cy="30.5" r="5.2" fill="#7E9C62" ${K}/>
     <path d="M2.5 41.5h43" ${N}/>` },
  night: { label: 'Nightlife', short: 'Night', art:
    `<ellipse cx="24" cy="41.5" rx="9" ry="2.4" fill="#CFE3E6" ${K}/>
     <path d="M24 26.5v14.5" fill="none" stroke="#4A4036" stroke-width="1.6" stroke-linecap="round"/>
     <path d="M8.5 9.5h31L24 26.5z" fill="#E3EEF0" ${K}/>
     <path d="M13.2 14.6h21.6L24 26.4z" fill="#F0C9A0"/>
     <path d="M8.5 9.5h31L24 26.5z" ${N}/>
     <path d="M33 4.5 21 19" fill="none" stroke="#9C7660" stroke-width="1.4" stroke-linecap="round"/>
     <circle cx="25.6" cy="13.6" r="3.2" fill="#8FAA72" ${K}/><circle cx="26.4" cy="12.9" r="1.1" fill="#D9604F"/>
     <path d="M11.5 10.8h7" fill="none" stroke="#fff" stroke-width="1.4" stroke-linecap="round" opacity=".8"/>` },
  other: { label: 'Other', art:
    `<path d="M24 31v11" fill="none" stroke="#7E9C62" stroke-width="1.8" stroke-linecap="round"/>
     <path d="M24 38c-3.5-3.5-7.5-3.5-9.5-1.5 3 2.6 6.6 2.8 9.5 1.5z" fill="#B5CF7A" ${K}/>
     <circle cx="24" cy="15" r="5.6" fill="#DCD5EE" ${K}/><circle cx="31.6" cy="20.5" r="5.6" fill="#DCD5EE" ${K}/>
     <circle cx="28.7" cy="29.5" r="5.6" fill="#DCD5EE" ${K}/><circle cx="19.3" cy="29.5" r="5.6" fill="#DCD5EE" ${K}/>
     <circle cx="16.4" cy="20.5" r="5.6" fill="#DCD5EE" ${K}/>
     <circle cx="24" cy="23" r="4.6" fill="#E2B857" ${K}/>` },
};
export const CAT_KEYS = Object.keys(CATS);
// Extra icons you can pick per pin (on top of the category icons).
export const EXTRA_ICONS = {
  lanterns: { label: 'Lanterns', art:
    `<circle cx="14" cy="24" r="10.5" fill="#F6D98C" opacity=".45"/><circle cx="32.5" cy="27.5" r="12" fill="#F6D98C" opacity=".45"/>
     <path d="M2.5 8.5Q24 18.5 45.5 8.5" ${N}/>
     <path d="M14 12.6V16M32.5 14.6v4" ${N}/>
     <ellipse cx="14" cy="24" rx="6" ry="8" fill="#E7A33E" ${K}/>
     <path d="M14 16.2v15.6M10.6 18.4c-1.6 3.6-1.6 7.6 0 11.2M17.4 18.4c1.6 3.6 1.6 7.6 0 11.2" fill="none" stroke="#4A4036" stroke-width=".8" opacity=".5"/>
     <ellipse cx="32.5" cy="27.5" rx="7" ry="9" fill="#E58C7E" ${K}/>
     <path d="M32.5 18.6v17.8M28.6 21c-1.8 4.2-1.8 8.8 0 13M36.4 21c1.8 4.2 1.8 8.8 0 13" fill="none" stroke="#4A4036" stroke-width=".8" opacity=".5"/>
     <path d="M11.5 16.4h5M11.5 31.6h5M29.6 18.8h5.8M29.6 36.2h5.8M14 31.8v4.2M32.5 36.5v4.5" ${N}/>` },
  songthaew: { label: 'Songthaew', art:
    `<path d="M18 17.5h22.5a2 2 0 0 1 2 2V34H18z" fill="#D9604F" ${K}/>
     <path d="M18.5 15.5h24" ${N}/>
     <path d="M21 21h18.5v5.5H21z" fill="#F7EFE0" ${K}/>
     <path d="M5.5 34v-8l4.5-6.5h8V34z" fill="#D9604F" ${K}/>
     <path d="M10.8 21.6H16v5.2H8.2z" fill="#CFE3E6" ${K}/>
     <path d="M4.5 34h39" ${N}/>
     <circle cx="12.5" cy="35.5" r="4" fill="#4A4036"/><circle cx="12.5" cy="35.5" r="1.5" fill="#F7EFE0"/>
     <circle cx="35" cy="35.5" r="4" fill="#4A4036"/><circle cx="35" cy="35.5" r="1.5" fill="#F7EFE0"/>` },
  heart: { label: 'Heart', art:
    `<path d="M24 41 9.5 27A9 9 0 0 1 24 15.2 9 9 0 0 1 38.5 27z" fill="#E58C7E" ${K}/>
     <path d="M15 23.5a4.5 4.5 0 0 1 5-4" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".8"/>` },
  star: { label: 'Star', art:
    `<path d="M24 7l5 10.6 11.6 1.4-8.6 8 2.3 11.5L24 32.8l-10.3 5.7L16 27l-8.6-8 11.6-1.4z" fill="#F2D37A" ${K}/>` },
  camera: { label: 'Photo spot', art:
    `<path d="M8 17h8l3-4.5h10l3 4.5h8v20H8z" fill="#C9D9DC" ${K}/>
     <circle cx="24" cy="27" r="7" fill="#F7EFE0" ${K}/><circle cx="24" cy="27" r="3.6" fill="#7FAEB5" ${K}/>
     <path d="M34 21h3" ${N}/>` },
  elephant: { label: 'Elephant', art:
    `<path d="M12 38V27c0-7 5-12 13-12 7 0 12 4 13 10 1.6 1 2.6 3 2.6 5.5V38h-5v-5h-4v5h-5v-5h-4v5h-5.6z" fill="#B7B4BE" ${K}/>
     <path d="M12 28c-3 1-4.5 4-4 8.5 1.6.6 3 .2 3.6-1" fill="#B7B4BE" ${K}/>
     <path d="M19 20c-3 0-5 3-4.5 7 2 .6 4.2-.6 5.3-2.6" fill="#CFCBD6" ${K}/>
     <circle cx="16.5" cy="24" r="1.1" fill="#4A4036"/>` },
};


export const IDEAS = [
  { id:'doisuthep', name:'Wat Phra That Doi Suthep', cat:'see', lat:18.8048, lng:98.9216, blurb:'The golden chedi up on the mountain, reached by a long naga staircase. Go early for cooler air and city views.' },
  { id:'chediluang', name:'Wat Chedi Luang', cat:'see', lat:18.7869, lng:98.9866, blurb:'A huge, half-ruined brick chedi in the middle of the Old City. Lovely at dusk.' },
  { id:'phrasingh', name:'Wat Phra Singh', cat:'see', lat:18.7884, lng:98.9819, blurb:'Classic Lanna-style temple at the west end of Ratchadamnoen Road.' },
  { id:'umong', name:'Wat Umong', cat:'see', lat:18.7829, lng:98.9516, blurb:'Forest temple with old brick tunnels. Shady, quiet, very photogenic.' },
  { id:'srisuphan', name:'Wat Sri Suphan', cat:'see', lat:18.7811, lng:98.9862, blurb:'The "silver temple" near Wua Lai Road, covered in hammered metalwork.' },
  { id:'suandok', name:'Wat Suan Dok', cat:'see', lat:18.7882, lng:98.9677, blurb:'Rows of white chedis with Doi Suthep as the backdrop.' },
  { id:'thaphae', name:'Tha Phae Gate', cat:'see', lat:18.7877, lng:98.9934, blurb:'The old east gate. Pigeons, photos, and the start of the Sunday market.' },
  { id:'sundaywalk', name:'Sunday Walking Street', cat:'night', lat:18.7881, lng:98.9890, blurb:'Ratchadamnoen Road turns into a giant night market every Sunday evening.' },
  { id:'satwalk', name:'Saturday Walking Street', cat:'night', lat:18.7798, lng:98.9866, blurb:'Wua Lai Road on Saturday nights. Smaller and calmer than Sunday, lots of silverwork.' },
  { id:'warorot', name:'Warorot Market', cat:'shop', lat:18.7905, lng:99.0004, blurb:'Locals’ market by the river. Grab sai ua sausage, nam prik and snacks to take home.' },
  { id:'nightbazaar', name:'Night Bazaar', cat:'shop', lat:18.7851, lng:99.0003, blurb:'Nightly souvenir stalls along Chang Klan Road.' },
  { id:'jingjai', name:'Jing Jai Market', cat:'shop', lat:18.8063, lng:98.9985, blurb:'Weekend morning market for local produce, crafts and breakfast.' },
  { id:'nimman', name:'Nimman', cat:'cafe', lat:18.7985, lng:98.9678, blurb:'The cafe-and-boutique neighbourhood. Wander the little sois off Nimmanhaemin Road.' },
  { id:'onenimman', name:'One Nimman', cat:'shop', lat:18.8000, lng:98.9686, blurb:'Brick plaza with shops, food and weekend pop-ups.' },
  { id:'maya', name:'Maya Lifestyle', cat:'shop', lat:18.8023, lng:98.9672, blurb:'Mall at the top of Nimman. Food court, aircon, rooftop view.' },
  { id:'khunyai', name:'Khao Soi Khun Yai', cat:'eat', lat:18.7962, lng:98.9852, blurb:'Tiny khao soi spot near the north moat. Lunch only, so check hours.' },
  { id:'changphueak', name:'Chang Phueak Gate food', cat:'eat', lat:18.7957, lng:98.9866, blurb:'Evening street food at the north gate, including the well-known pork leg rice stall.' },
  { id:'kangwat', name:'Baan Kang Wat', cat:'shop', lat:18.7768, lng:98.9462, blurb:'Little artists’ village with workshops, studios and cafes.' },
  { id:'angkaew', name:'Ang Kaew Reservoir', cat:'nature', lat:18.8063, lng:98.9505, blurb:'Lake loop inside Chiang Mai University with mountain views. Nice at sunset.' },
  { id:'huaytungtao', name:'Huay Tung Tao Lake', cat:'nature', lat:18.8680, lng:98.9415, blurb:'Bamboo huts over a lake at the foot of the mountain. Order food and lounge.' },
  { id:'doipui', name:'Doi Pui Hmong Village', cat:'nature', lat:18.8166, lng:98.8840, blurb:'Hill village above Doi Suthep with flower gardens and cooler air.' },
  { id:'zoo', name:'Chiang Mai Zoo', cat:'nature', lat:18.8085, lng:98.9467, blurb:'Big hillside zoo at the start of the Doi Suthep road.' },
  { id:'rajapruek', name:'Royal Park Rajapruek', cat:'nature', lat:18.7465, lng:98.9255, blurb:'Large botanical garden south-west of town.' },
];

// Searchable only (not drawn as idea markers). Positions approximate.
export const EXTRA = [
  { id:'lokmolee', name:'Wat Lok Molee', cat:'see', lat:18.7951, lng:98.9832, blurb:'Dark teak temple and old brick chedi just north of the moat.' },
  { id:'chiangman', name:'Wat Chiang Man', cat:'see', lat:18.7935, lng:98.9893, blurb:'Said to be the oldest temple in the city, with an elephant-ringed chedi.' },
  { id:'phantao', name:'Wat Phan Tao', cat:'see', lat:18.7871, lng:98.9873, blurb:'All-teak temple hall right next to Wat Chedi Luang.' },
  { id:'phalat', name:'Wat Pha Lat', cat:'see', lat:18.8008, lng:98.9270, blurb:'Jungle temple by a waterfall, halfway up the Monk’s Trail.', alias:'pha lat waterfall temple' },
  { id:'monkstrail', name:'Monk’s Trail', cat:'nature', lat:18.8055, lng:98.9440, blurb:'Forest hiking trail up to Wat Pha Lat and on to Doi Suthep.', alias:'monks trail hike hiking' },
  { id:'jedyod', name:'Wat Jed Yod', cat:'see', lat:18.8090, lng:98.9720, blurb:'15th-century temple with a seven-spired chedi.' },
  { id:'ketkaram', name:'Wat Ket Karam', cat:'see', lat:18.7915, lng:99.0050, blurb:'Riverside temple with a quirky little museum.' },
  { id:'doikham', name:'Wat Phra That Doi Kham', cat:'see', lat:18.7590, lng:98.9180, blurb:'Hilltop temple with a big seated Buddha and views over the south of town.', alias:'doi kham' },
  { id:'bhubing', name:'Bhubing Palace', cat:'see', lat:18.8045, lng:98.8990, blurb:'Royal winter palace gardens past Doi Suthep. Dress code applies.', alias:'phu phing' },
  { id:'threekings', name:'Three Kings Monument', cat:'see', lat:18.7903, lng:98.9870, blurb:'Statues of the city’s founders in the Old City.' },
  { id:'lannamuseum', name:'Lanna Folklife Museum', cat:'see', lat:18.7899, lng:98.9874, blurb:'Small museum on northern Thai life and temple art.' },
  { id:'wiangkumkam', name:'Wiang Kum Kam', cat:'see', lat:18.7550, lng:99.0050, blurb:'Ruins of the ancient city that came before Chiang Mai.' },
  { id:'huaykaewfall', name:'Huay Kaew Waterfall', cat:'nature', lat:18.8140, lng:98.9440, blurb:'Small waterfall at the foot of Doi Suthep, next to the zoo.' },
  { id:'nightsafari', name:'Chiang Mai Night Safari', cat:'nature', lat:18.7395, lng:98.9175, blurb:'Tram tours past animals after dark.' },
  { id:'grandcanyon', name:'Grand Canyon Chiang Mai', cat:'nature', lat:18.6960, lng:98.8920, blurb:'Flooded quarry turned swim spot and water park.' },
  { id:'stickyfalls', name:'Bua Thong Sticky Waterfall', cat:'nature', lat:19.0640, lng:99.0790, blurb:'Day trip north. You can walk up the grippy limestone falls.', alias:'sticky waterfall' },
  { id:'inthanon', name:'Doi Inthanon', cat:'nature', lat:18.5880, lng:98.4870, blurb:'Thailand’s highest peak. Full-day trip from the city.' },
  { id:'bosang', name:'Bo Sang Umbrella Village', cat:'shop', lat:18.7660, lng:99.1350, blurb:'Watch paper umbrellas being hand-painted, east of town.', alias:'umbrella' },
  { id:'gatemarket', name:'Chiang Mai Gate Market', cat:'eat', lat:18.7805, lng:98.9895, blurb:'Food market at the south gate, busiest in the evening.', alias:'pratu chiang mai' },
  { id:'somphet', name:'Somphet Market', cat:'shop', lat:18.7930, lng:98.9925, blurb:'Small local market in the north-east of the Old City.' },
  { id:'muangmai', name:'Muang Mai Market', cat:'shop', lat:18.7955, lng:99.0015, blurb:'Big wholesale fruit and veg market by the river.' },
  { id:'tonlamyai', name:'Ton Lamyai Flower Market', cat:'shop', lat:18.7898, lng:99.0012, blurb:'Flower stalls beside Warorot, open late.', alias:'flower market' },
  { id:'kadnamor', name:'Kad Na Mor Night Market', cat:'eat', lat:18.8040, lng:98.9560, blurb:'Student night market by CMU with cheap eats.', alias:'malin plaza cmu night market' },
  { id:'central', name:'Central Festival Chiang Mai', cat:'shop', lat:18.8075, lng:99.0180, blurb:'Huge mall on the east side of town.' },
  { id:'centralairport', name:'Central Chiangmai Airport', cat:'shop', lat:18.7680, lng:98.9750, blurb:'Mall near the airport, handy for last-minute shopping.' },
  { id:'thinkpark', name:'Think Park', cat:'shop', lat:18.8015, lng:98.9670, blurb:'Open-air plaza at the corner of Nimman.' },
  { id:'ristr8to', name:'Ristr8to', cat:'cafe', lat:18.7997, lng:98.9677, blurb:'Well-known specialty coffee bar on Nimman.' },
  { id:'graphcafe', name:'Graph Cafe', cat:'cafe', lat:18.7919, lng:98.9924, blurb:'Tiny, stylish coffee spot in the Old City.' },
  { id:'warmup', name:'Warm Up Cafe', cat:'night', lat:18.7935, lng:98.9665, blurb:'Long-running Nimman club with live music.' },
  { id:'zoe', name:'Zoe in Yellow', cat:'night', lat:18.7915, lng:98.9925, blurb:'Backpacker bar cluster in the Old City.' },
  { id:'northgate', name:'North Gate Jazz Co-Op', cat:'night', lat:18.7957, lng:98.9862, blurb:'Packed little jazz bar at Chang Phueak Gate.', alias:'jazz' },
  { id:'riversidebar', name:'The Riverside Bar & Restaurant', cat:'night', lat:18.7895, lng:99.0045, blurb:'Live music and dinner on the Ping River.' },
  { id:'huenphen', name:'Huen Phen', cat:'eat', lat:18.7845, lng:98.9835, blurb:'Northern Thai classics in the Old City.' },
  { id:'spchicken', name:'SP Chicken', cat:'eat', lat:18.7896, lng:98.9820, blurb:'Rotisserie chicken and som tam near Wat Phra Singh.' },
  { id:'tongtemtoh', name:'Tong Tem Toh', cat:'eat', lat:18.7975, lng:98.9675, blurb:'Popular northern Thai spot on Nimman. Expect a queue.' },
  { id:'khaosoimaesai', name:'Khao Soi Mae Sai', cat:'eat', lat:18.8015, lng:98.9790, blurb:'Local favourite for khao soi, mornings to early afternoon.' },
  { id:'ironbridge', name:'Iron Bridge (Nawarat)', cat:'see', lat:18.7883, lng:99.0030, blurb:'Footbridge over the Ping. Nice at night.', alias:'iron bridge nawarat' },
  { id:'airport', name:'Chiang Mai Airport (CNX)', cat:'other', lat:18.7668, lng:98.9626, blurb:'International airport, about 15 minutes from the Old City.', alias:'cnx airport' },
  { id:'trainstation', name:'Chiang Mai Railway Station', cat:'other', lat:18.7847, lng:99.0167, blurb:'Overnight trains to and from Bangkok.', alias:'train' },
  { id:'arcade', name:'Arcade Bus Terminal', cat:'other', lat:18.8050, lng:99.0160, blurb:'Long-distance buses, e.g. to Chiang Rai and Pai.', alias:'bus station' },
  { id:'a-oldcity', name:'Old City (area)', cat:'stay', lat:18.7880, lng:98.9860, blurb:'Walkable area inside the moat, full of temples and guesthouses.' },
  { id:'a-nimman', name:'Nimman (area)', cat:'stay', lat:18.7980, lng:98.9675, blurb:'Trendy area with cafes, malls and newer hotels.' },
  { id:'a-riverside', name:'Riverside (area)', cat:'stay', lat:18.7880, lng:99.0040, blurb:'Quieter stays along the Ping, close to the Night Bazaar.' },
];
const ALIASES = { chediluang:'chedi luang', srisuphan:'silver temple', jingjai:'jj market', warorot:'kad luang', sundaywalk:'sunday market', satwalk:'saturday market wualai', doisuthep:'doi suthep', huaytungtao:'huai tung tao', kangwat:'ban kang wat' };
export const DIR = [...IDEAS.map(i => ({ ...i, alias: ALIASES[i.id] || '' })), ...EXTRA];

// Hand-lettered neighbourhood names painted onto the map (approximate centres).
export const AREAS = [
  { name: 'Old City',        lat: 18.7884, lng: 98.9868, size: 'l', min: 12 },
  { name: 'Nimman',          lat: 18.7990, lng: 98.9655, size: 'm', min: 13 },
  { name: 'Ping River',      lat: 18.7930, lng: 99.0060, size: 'm', min: 13, water: true },
  { name: 'Night Bazaar',    lat: 18.7832, lng: 99.0000, size: 's', min: 15 },
  { name: 'Santitham',       lat: 18.8045, lng: 98.9825, size: 's', min: 15 },
  { name: 'Wua Lai',         lat: 18.7772, lng: 98.9868, size: 's', min: 15 },
  { name: 'Chiang Mai Uni',  lat: 18.8020, lng: 98.9530, size: 's', min: 15 },
  { name: 'Doi Suthep',      lat: 18.8070, lng: 98.9170, size: 'l', min: 11 },
  { name: 'Chang Khlan',     lat: 18.7760, lng: 99.0010, size: 's', min: 15 },
];

// Little painted decorations scattered on the map (no meaning, just charm).
// kind: lotus (moat corners), tree, hill. Coordinates approximate.
export const DECOR = [
  { kind: 'lotus', lat: 18.79555, lng: 98.99375 }, { kind: 'lotus', lat: 18.79560, lng: 98.97985 },
  { kind: 'lotus', lat: 18.78080, lng: 98.97990 }, { kind: 'lotus', lat: 18.78070, lng: 98.99370 },
  { kind: 'tree', lat: 18.8110, lng: 98.9300 }, { kind: 'tree', lat: 18.7990, lng: 98.9250 },
  { kind: 'tree', lat: 18.8160, lng: 98.9420 }, { kind: 'hill', lat: 18.8020, lng: 98.9050 },
  { kind: 'tree', lat: 18.7930, lng: 98.9440 }, { kind: 'hill', lat: 18.8200, lng: 98.9120 },
];
