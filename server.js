var express = require('express');
const session = require('express-session');
const mongoose = require('mongoose');
mongoose.connect('mongodb://localhost:27017/swe432pa2', { useNewUrlParser: true, useUnifiedTopology: true });
const app = express();
const Schema = mongoose.Schema;
const bodyParser = require('body-parser');

// Use express-session middleware
app.use(session({
    secret: 'mysecretkey',
    resave: false,
    saveUninitialized: true,
}));

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));

const songSchema = new Schema({
    title: String,
    artist: String,
    album: String,
    duration: Number
});

const DJSchema = new Schema({
    name: String,
});

var playlistSchema = new Schema({
    name: String,
    description: String,
    songs: [{
        type: Schema.Types.ObjectId,
        ref: 'Song',
    }],
  });

  const pUserSchema = new Schema({
    username: String,
    password: String,
    workingPlaylist: {
        type: Schema.Types.ObjectId,
        ref: 'playlist'
    }
});

// create user model
const User = mongoose.model('Producer', pUserSchema);
const Song = mongoose.model('Song', songSchema);
const DJ = mongoose.model('DJ', DJSchema);
const Playlist = mongoose.model('playlist', playlistSchema);

const createDefaultAdmin = async () => {
    const adminExists = await User.findOne({ username: 'admin' });
    if (!adminExists) {
      await User.create({ username: 'admin', password: 'password' });
    }
  };
  createDefaultAdmin();

async function updateExistingUsers() {
    try {
        const users = await User.find();

        for (const user of users) {
            if (!Array.isArray(user.workingPlaylist)) {
                user.workingPlaylist = [user.workingPlaylist];
            }

            await user.save();
        }

        console.log('Existing users updated successfully.');
    } 
    catch (error) {
        console.error('Error updating existing users:', error);
    }
}

updateExistingUsers();

app.get('/', async function(req, res) {
    try {
      const songs = await Song.aggregate([{ $sample: { size: 5 } }]);
  
      if (req.session.username) {
        res.render('/home', { username: req.session.username, songs: songs, songId: req.session.currentSongId  });
      } else {
        res.render('pages/login');
      }
    } catch (err) {
      console.error(err);
      return res.status(500).send('Server Error');
    }
  });
  // Login page route
app.get('/login', function (req, res) {
    res.render('pages/login', { message: '' });
});

app.get('/home', function (req, res) {
    // Check if the user is logged in before rendering the home page
    if (req.session.username) {
        res.render('pages/home', { username: req.session.username, songId: req.session.currentSongId  });
    }
    else {
        res.redirect('/login');
    }
});

app.get('/profile', function (req, res) {
    // Check if the user is logged in before rendering the profile page
    if (req.session.username) {
        res.render('pages/profile', { username: req.session.username,  songId: req.session.currentSongId });
    }
    else {
        res.redirect('/login');
    }
});

app.get('/settings', function (req, res) {
    res.render('pages/settings', {songId: req.session.currentSongId} );
});


app.get('/edit', function (req, res) {
    if (req.session.currentSongId) {
        res.render('pages/edit', { songId: req.session.currentSongId });
    }
});

// Login page route
app.get('/login', function (req, res) {
    res.render('pages/login', { message: '' });
});

// Login post route
app.post('/login', function (req, res) {
    const { username, password } = req.body;

    User.findOne({ username: username, password: password }).exec()
        .then(user => {
            if (user) {
                // Store username in the session
                req.session.username = username;
                res.redirect('/home');
            }
            else {
                res.render('pages/login', { message: 'Login failed. Please try again.' });
            }
        })
        .catch(err => {
            console.error(err);
            res.redirect('/login');
        });
});

// Add this route to your server code
app.get('/logout', function (req, res) {
    // Clear the session
    req.session.destroy(function (err) {
        if (err) {
            console.error(err);
        }
        // Redirect to the login page after clearing the session
        res.redirect('/login');
    });
});



app.get('/search', async (req, res) => {
    const searchTerm = req.query.term;

    if (!searchTerm) {
        return res.status(400).json({ error: 'Please provide a search term' });
    }

    try {
        const result = await Song.findOne({ title: new RegExp(searchTerm, 'i') });

        if (result) {
            res.json(result);
        }
        else {
            res.json({ message: 'Song not found' });
        }
    }
    catch (error) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.get('/getRandomSong', async (req, res) => {
    try {
        const result = await Song.aggregate([{ $sample: { size: 1 } }]);
        const randomSong = result[0];

        console.log('Random Song:', randomSong); // Debug statement
        // Include the song ID in the session
        req.session.currentSongId = randomSong._id;

        // Include the song details in the response
        res.json({
            title: randomSong.title,
            artist: randomSong.artist,
            album: randomSong.album || '',
            _id: randomSong._id, // Include the song ID
        });
    }
    catch (error) {
        console.error('Error fetching random song:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});


app.get('/getAllSongs', async (req, res) => {
    try {
        const songs = await Song.find();
        // console.log('Songs:', songs); // Add this line for logging
        res.json(songs);
    }
    catch (error) {
        console.error('Error fetching songs:', error); // Add this line for logging
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.get('/getWorkingPlaylists', async (req, res) => {
    try {
        const username = req.session.username;
        const user = await User.findOne({ username }).exec();

        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        const workingPlaylistId = user.workingPlaylist;

        console.log('populated songs:', workingPlaylistId);
        if (!workingPlaylistId) {
            return res.status(404).json({ message: 'Working playlist not found for the user.' });
        }

        // Fetch the playlist using its ID
        const playlist = await Playlist.findOne({ _id: { $in: workingPlaylistId } }).exec();
        if (!playlist) {
            return res.status(404).json({ message: 'playlist not found.' });
        }
        console.log('populated songs:', playlist);

        const play = playlist.songs
        console.log('populated songs:', play);
        if (play && play.length > 0) {
            // If preferences exist, you may want to populate the song details
            // using a separate query if the song details are in a separate 'Song' collection
            // Replace 'Song' with the actual model name if different
            const pop = await Song.find({ _id: { $in: play } }).exec();
            console.log('populated songs:', pop); 
            res.json(pop);
        } else {
            res.json([]); // Return an empty array if no preferences found
        }
    } catch (error) {
        console.error('Error fetching user working playlist:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.get('/getAllDJs', async (req, res) => {
    try {
        const djs = await DJ.find();
        // console.log('Songs:', songs); // Add this line for logging
        res.json(djs);
    }
    catch (error) {
        console.error('Error fetching DJs:', error); // Add this line for logging
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.get('/getAllPlaylists', async (req, res) => {
    try {
        const playlists = await Playlist.find(); // Fetch all playlists

        res.json(playlists);
    } catch (error) {
        console.error('Error fetching playlists:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.get('/getRandomDJ', async (req, res) => {
    try {
        const count = await DJ.countDocuments();
        const randomIndex = Math.floor(Math.random() * count);

        const randomDJ = await DJ.findOne().skip(randomIndex);

        res.json({ name: randomDJ.name }); // Adjust the response format
    }
    catch (error) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/changePassword', async (req, res) => {
    const { oldPassword, newPassword } = req.body;

    // Check if the old password matches the user's current password (you may need to modify this based on your authentication logic)
    const user = await User.findOne({ username: req.session.username, password: oldPassword }).exec();

    if (user) {
        // Update the user's password
        user.password = newPassword;
        await user.save();

        res.json({ message: 'Password changed successfully.' });
    }
    else {
        res.status(401).json({ message: 'Incorrect old password.' });
    }
});

app.post('/addToPlaylist', async (req, res) => {
    try {
        const username = req.session.username;
        const user = await User.findOne({ username }).exec();

        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        const songId = req.body.songId; // Assuming the request body contains the songId

        const workingPlaylistId = user.workingPlaylist;

        console.log('populated songs:', workingPlaylistId);
        if (!workingPlaylistId) {
            return res.status(404).json({ message: 'Working playlist not found for the user.' });
        }

        // Fetch the playlist using its ID
        const playlist = await Playlist.findOne({ _id: { $in: workingPlaylistId } }).exec();
        if (!playlist) {
            return res.status(404).json({ message: 'playlist not found.' });
        }

        const play = playlist.songs
        if (play.includes(songId)) {
            return res.status(400).json({ message: 'Song is already in the current playlist.' });
        } else {
            play.push(songId);
        }

        await playlist.save();

        res.json({ message: 'Song added to the current playlist.' });
    } catch (error) {
        console.error('Error adding song to the current playlist:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/removeFromPlaylist', async (req, res) => {
    try {
        const username = req.session.username;
        const user = await User.findOne({ username }).exec();

        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        const songId = req.body.songId; // Assuming the request body contains the songId

        const workingPlaylistId = user.workingPlaylist;

        console.log('populated songs:', workingPlaylistId);
        if (!workingPlaylistId) {
            return res.status(404).json({ message: 'Working playlist not found for the user.' });
        }

        // Fetch the playlist using its ID
        const playlist = await Playlist.findOne({ _id: { $in: workingPlaylistId } }).exec();
        if (!playlist) {
            return res.status(404).json({ message: 'playlist not found.' });
        }
        const play = playlist.songs
        const index = play.indexOf(songId);
        if (index !== -1) {
            play.splice(index, 1);
            await playlist.save();
            res.json({ message: 'Song removed from the current playlist.' });
        } else {
            res.status(400).json({ message: 'Song not found in the current playlist.' });
        }
    } catch (error) {
        console.error('Error removing song from playlist:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});
app.post('/setWorkingPlaylist', async (req, res) => {
    try {
        const username = req.session.username;
        const user = await User.findOne({ username }).exec();

        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        const playlistId = req.body.playlistId;

        // Update the user's workingPlaylist
        user.workingPlaylist = playlistId;
        await user.save();

        res.json({ message: `Working playlist updated to ${playlistId}.` });
    } catch (error) {
        console.error('Error setting working playlist:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});


app.listen(8080);
console.log('Server listening on port 8080');

