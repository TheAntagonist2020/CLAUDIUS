const { getDb } = require('../db');
const { buildTasteProfile } = require('../taste/buildProfile');
const { scoreDiscoveryPool } = require('../discovery/recommend');

// TMDB standard genre IDs
const GENRES = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime',
  99: 'Documentary', 18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History',
  27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi',
  53: 'Thriller', 10752: 'War', 37: 'Western',
};

// Watched films: real TMDB metadata, with hand-picked ratings
// [title, year, tmdb_id, imdb_id, runtime, [genre_ids], rating]
const WATCHED = [
  ['The Shawshank Redemption', 1994, 278, 'tt0111161', 142, [18, 80], 10],
  ['The Godfather', 1972, 238, 'tt0068646', 175, [18, 80], 10],
  ['The Dark Knight', 2008, 155, 'tt0468569', 152, [28, 80, 18, 53], 9],
  ['Pulp Fiction', 1994, 680, 'tt0110912', 154, [53, 80], 9],
  ['Fight Club', 1999, 550, 'tt0137523', 139, [18, 53], 8],
  ['Forrest Gump', 1994, 13, 'tt0109830', 142, [18, 10749], 8],
  ['Inception', 2010, 27205, 'tt1375666', 148, [28, 878, 12], 9],
  ['Goodfellas', 1990, 769, 'tt0099685', 146, [18, 80], 10],
  ["Schindler's List", 1993, 424, 'tt0108052', 195, [18, 36, 10752], 10],
  ['The Matrix', 1999, 603, 'tt0133093', 136, [28, 878], 9],
  ['2001: A Space Odyssey', 1968, 62, 'tt0062622', 149, [878, 12], 9],
  ['Interstellar', 2014, 157336, 'tt0816692', 169, [12, 18, 878], 9],
  ['Parasite', 2019, 496243, 'tt6751668', 132, [53, 18, 35], 10],
  ['The Silence of the Lambs', 1991, 274, 'tt0102926', 118, [80, 18, 53], 9],
  ['Blade Runner', 1982, 78, 'tt0083658', 117, [878, 18], 8],
  ['Blade Runner 2049', 2017, 335984, 'tt1856101', 164, [878, 18], 9],
  ['Taxi Driver', 1976, 103, 'tt0075314', 114, [80, 18], 8],
  ['Apocalypse Now', 1979, 28, 'tt0078788', 153, [18, 10752], 9],
  ['Casablanca', 1942, 289, 'tt0034583', 102, [18, 10749, 10752], 8],
  ['Citizen Kane', 1941, 15, 'tt0033467', 119, [18, 9648], 8],
  ['Raging Bull', 1980, 1578, 'tt0081398', 129, [18], 8],
  ['Seven Samurai', 1954, 346, 'tt0047478', 207, [28, 18], 10],
  ['Spirited Away', 2001, 129, 'tt0245429', 125, [16, 10751, 14], 10],
  ['Whiplash', 2014, 244786, 'tt2582802', 106, [18, 10402], 9],
  ['The Social Network', 2010, 37799, 'tt1285016', 120, [18], 8],
  ['Mad Max: Fury Road', 2015, 76341, 'tt1392190', 120, [28, 12, 878], 9],
  ['There Will Be Blood', 2007, 7345, 'tt0469494', 158, [18], 9],
  ['No Country for Old Men', 2007, 6977, 'tt0477348', 122, [80, 18, 53], 9],
  ['The Departed', 2006, 1422, 'tt0407887', 151, [18, 53, 80], 9],
  ['The Prestige', 2006, 1124, 'tt0482571', 130, [18, 53, 9648, 878], 9],
  ['Memento', 2000, 77, 'tt0209144', 113, [9648, 53], 9],
  ['La La Land', 2016, 313369, 'tt3783958', 128, [35, 18, 10402, 10749], 8],
  ['Moonlight', 2016, 376867, 'tt4975722', 111, [18], 8],
  ['Get Out', 2017, 419430, 'tt5052448', 104, [27, 9648, 53], 8],
  ['Dune', 2021, 438631, 'tt1160419', 155, [12, 18, 878], 9],
  ['Everything Everywhere All at Once', 2022, 545611, 'tt6710474', 139, [28, 12, 878, 35], 9],
  ['Oppenheimer', 2023, 872585, 'tt15398776', 180, [18, 36], 9],
  ['The Grand Budapest Hotel', 2014, 120467, 'tt2278388', 99, [35, 18], 8],
  ['Drive', 2011, 64690, 'tt0780504', 100, [18, 80], 8],
  ['Arrival', 2016, 329865, 'tt2543164', 116, [18, 878, 9648], 9],
  ['The Lord of the Rings: The Fellowship of the Ring', 2001, 120, 'tt0120737', 178, [12, 14, 28], 10],
  ['The Lord of the Rings: The Two Towers', 2002, 121, 'tt0167261', 179, [12, 14, 28], 10],
  ['The Lord of the Rings: The Return of the King', 2003, 122, 'tt0167260', 201, [12, 14, 28], 10],
];

// Discovery pool: films they haven't watched but might want to
// [title, year, tmdb_id, imdb_id, runtime, genres_str, imdb_rating, tmdb_rating, metascore, rt_tomatometer, source_lists]
const DISCOVERY = [
  ['The Godfather Part II', 1974, 240, 'tt0071562', 202, 'Drama,Crime', 9.0, 8.6, 90, 96, 'IMDb Top 250,AFI Top 100'],
  ['12 Angry Men', 1957, 389, 'tt0050083', 96, 'Drama', 9.0, 8.5, 97, 100, 'IMDb Top 250'],
  ['The Lord of the Rings: The Return of the King (Extended)', 2003, 122, 'tt0167260', 251, 'Adventure,Fantasy', 9.0, 8.5, 94, 93, 'IMDb Top 250'],
  ['City of God', 2002, 598, 'tt0317248', 130, 'Crime,Drama', 8.6, 8.4, 79, 91, 'Criterion,IMDb Top 250'],
  ['Once Upon a Time in the West', 1968, 335, 'tt0064116', 165, 'Western', 8.5, 8.3, 80, 95, 'AFI Top 100,Criterion'],
  ['Grave of the Fireflies', 1988, 12477, 'tt0095327', 89, 'Animation,Drama,War', 8.5, 8.4, 94, 100, 'Criterion'],
  ['The Lives of Others', 2006, 582, 'tt0405094', 137, 'Drama,Thriller', 8.4, 8.1, 89, 92, 'Oscar Winner'],
  ['Amadeus', 1984, 279, 'tt0086879', 161, 'Drama,History,Music', 8.4, 8.2, 88, 90, 'AFI Top 100,Oscar Best Picture'],
  ['Chinatown', 1974, 829, 'tt0071315', 130, 'Mystery,Thriller,Drama', 8.1, 7.9, 92, 99, 'AFI Top 100'],
  ['Rear Window', 1954, 567, 'tt0047396', 112, 'Mystery,Thriller', 8.5, 8.4, 100, 99, 'AFI Top 100,Criterion'],
  ['Paths of Glory', 1957, 975, 'tt0050825', 88, 'Drama,War', 8.4, 8.3, 90, 95, 'Criterion,Kubrick'],
  ['Princess Mononoke', 1997, 128, 'tt0119698', 134, 'Animation,Adventure,Fantasy', 8.4, 8.3, 76, 93, 'Ghibli,Criterion'],
  ['The Treasure of the Sierra Madre', 1948, 3090, 'tt0040897', 126, 'Adventure,Drama,Western', 8.2, 8.0, 98, 100, 'AFI Top 100'],
  ['Wild Strawberries', 1957, 509, 'tt0050986', 91, 'Drama', 8.1, 8.0, null, 95, 'Criterion,Bergman'],
  ['The Third Man', 1949, 1092, 'tt0041959', 93, 'Mystery,Thriller,Film-Noir', 8.1, 8.1, 97, 100, 'Criterion,AFI'],
  ['Come and See', 1985, 25237, 'tt0091251', 142, 'Drama,War', 8.4, 8.3, null, 97, 'Criterion,Sight & Sound'],
  ['The Wages of Fear', 1953, 348, 'tt0046268', 131, 'Adventure,Drama,Thriller', 8.2, 8.1, 85, 100, 'Criterion'],
  ['Barry Lyndon', 1975, 963, 'tt0072684', 185, 'Drama,History,War', 8.1, 8.0, 89, 95, 'Kubrick,Criterion'],
  ['The Piano', 1993, 41, 'tt0107822', 121, 'Drama,Romance', 7.5, 7.4, 89, 91, 'Palme d\'Or'],
  ['In the Mood for Love', 2000, 843, 'tt0118694', 99, 'Drama,Romance', 8.1, 8.1, 87, 91, 'Criterion,Sight & Sound'],
  ['Portrait of a Lady on Fire', 2019, 531219, 'tt8613070', 122, 'Drama,Romance', 8.1, 8.2, 95, 97, 'Cannes,Criterion'],
  ['The Zone of Interest', 2023, 467244, 'tt7160372', 106, 'Drama,War', 7.4, 7.4, 93, 93, 'Oscar Winner,Cannes'],
  ['Anatomy of a Fall', 2023, 915935, 'tt17009710', 152, 'Drama,Mystery,Thriller', 7.7, 7.7, 91, 95, 'Palme d\'Or'],
  ['Past Lives', 2023, 666277, 'tt13238346', 105, 'Drama,Romance', 7.8, 7.9, 94, 95, 'Oscar Nominee'],
  ['Killers of the Flower Moon', 2023, 466420, 'tt5537002', 206, 'Crime,Drama,History', 7.6, 7.5, 89, 93, 'Oscar Nominee'],
  ['Poor Things', 2023, 792307, 'tt14230458', 141, 'Comedy,Drama,Romance,Sci-Fi', 7.8, 7.7, 87, 92, 'Oscar Winner'],
  ['The Holdovers', 2023, 840430, 'tt14849194', 133, 'Comedy,Drama', 7.9, 7.7, 82, 97, 'Oscar Nominee'],
  ['The Hunt', 2012, 72863, 'tt2106476', 115, 'Drama', 8.3, 8.1, 77, 93, 'Cannes'],
  ['A Separation', 2011, 57800, 'tt1832382', 123, 'Drama', 8.3, 8.0, 95, 99, 'Oscar Winner,Criterion'],
  ['The Banshees of Inisherin', 2022, 674324, 'tt11813216', 114, 'Comedy,Drama', 7.7, 7.5, 87, 96, 'Oscar Nominee'],
];

// Watchlist items the user has explicitly added
const WATCHLIST = [
  ['Stalker', 1979, 1398, 'Criterion Collection — been meaning to watch'],
  ['Andrei Rublev', 1966, 1402, 'Tarkovsky'],
  ['Tokyo Story', 1953, 18148, 'Ozu masterwork'],
  ['Persona', 1966, 735, 'Bergman'],
  ['8½', 1963, 10410, 'Fellini — need to see it'],
  ['Beau Travail', 1999, 52404, 'Claire Denis'],
  ['Satantango', 1994, 8610, 'Long one — save for a weekend'],
  ['Aguirre, the Wrath of God', 1972, 969, 'Herzog'],
  ['The Mirror', 1975, 1399, 'Tarkovsky'],
  ['Yi Yi', 2000, 13667, 'Edward Yang'],
];

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function seedDemo() {
  const db = getDb();

  console.log('Seeding demo data...');

  const insertGenre = db.prepare('INSERT OR IGNORE INTO genres (id, name) VALUES (?, ?)');
  const insertFilm = db.prepare(`
    INSERT OR IGNORE INTO films (title, year, tmdb_id, imdb_id, runtime, enriched)
    VALUES (@title, @year, @tmdb_id, @imdb_id, @runtime, 0)
  `);
  const getFilmByTmdb = db.prepare('SELECT id FROM films WHERE tmdb_id = ?');
  const linkGenre = db.prepare('INSERT OR IGNORE INTO film_genres (film_id, genre_id) VALUES (?, ?)');
  const insertWatch = db.prepare(`
    INSERT INTO watches (film_id, watched_at, source) VALUES (?, ?, 'seed')
  `);
  const insertRating = db.prepare(`
    INSERT OR REPLACE INTO ratings (film_id, rating, rated_at, source)
    VALUES (?, ?, ?, 'seed')
  `);
  const insertDiscovery = db.prepare(`
    INSERT OR IGNORE INTO discovery_pool
    (title, year, tmdb_id, imdb_id, runtime, genres, imdb_rating, tmdb_rating,
     metascore, rt_tomatometer, source_lists)
    VALUES (@title, @year, @tmdb_id, @imdb_id, @runtime, @genres, @imdb_rating,
            @tmdb_rating, @metascore, @rt_tomatometer, @source_lists)
  `);
  const insertWatchlist = db.prepare(`
    INSERT OR IGNORE INTO watchlist (title, year, tmdb_id, category, source, notes)
    VALUES (@title, @year, @tmdb_id, 'to_watch', 'seed', @notes)
  `);

  const run = db.transaction(() => {
    for (const [id, name] of Object.entries(GENRES)) {
      insertGenre.run(Number(id), name);
    }

    WATCHED.forEach((row, idx) => {
      const [title, year, tmdbId, imdbId, runtime, genreIds, rating] = row;
      insertFilm.run({ title, year, tmdb_id: tmdbId, imdb_id: imdbId, runtime });
      const film = getFilmByTmdb.get(tmdbId);
      if (!film) return;
      for (const g of genreIds) linkGenre.run(film.id, g);
      insertWatch.run(film.id, daysAgo(idx * 9 + 3));
      if (rating) insertRating.run(film.id, rating, daysAgo(idx * 9 + 3));
    });

    for (const d of DISCOVERY) {
      const [title, year, tmdbId, imdbId, runtime, genres, imdb, tmdb, meta, rt, lists] = d;
      insertDiscovery.run({
        title, year, tmdb_id: tmdbId, imdb_id: imdbId, runtime, genres,
        imdb_rating: imdb, tmdb_rating: tmdb, metascore: meta,
        rt_tomatometer: rt, source_lists: lists,
      });
    }

    for (const [title, year, tmdbId, notes] of WATCHLIST) {
      insertWatchlist.run({ title, year, tmdb_id: tmdbId, notes });
    }
  });

  run();

  console.log(`  Seeded ${WATCHED.length} watched films, ${DISCOVERY.length} discovery candidates, ${WATCHLIST.length} watchlist items.`);

  console.log('Building taste profile...');
  buildTasteProfile();

  console.log('Scoring discovery pool...');
  scoreDiscoveryPool();

  console.log('Seed complete.');
  return {
    watched: WATCHED.length,
    discovery: DISCOVERY.length,
    watchlist: WATCHLIST.length,
  };
}

if (require.main === module) {
  seedDemo();
}

module.exports = { seedDemo };
