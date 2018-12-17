/* eslint-disable indent */
'use strict';

//Application Dependencies
const express = require('express');
const pg = require('pg');
const cors = require('cors');
const superAgent = require('superagent');

// Calling Date.now() returns the time in milliseconds since Jan 1 1970 00:00:00 UTC
// Multiplying an amount of milliseconds by 1000 achieves 1 second in computer time
// we will have a 15 second cache invalidation
// Darksky api has a request limit of 1000 hits a day
const timeouts = {
  weather: 15 * 1000, //15 seconds
  meetups: 60 * 60 * 24 * 1000 // 24 hours
}

//Load env vars;
require('dotenv').config();

const PORT = process.env.PORT || 3000;
//postgress setup
const client = new pg.Client(process.env.DATABASE_URL);
client.connect();
client.on('error', err => console.error(err));

//app gets
const app = express();
app.use(cors());
app.get('/location', getLocation);
// Get weather data
app.get('/weather', (request, response) => {
  searchWeather(request.query.data /*|| 'Lynnwood, WA'*/)
    .then(weatherData => {
      response.send(weatherData);
    })
    .catch(err => {
      console.log('========== error from weather ===========')
      console.error(err);
    })
  // console.log(weatherGet);
});
app.get('/yelp', getYelp);

app.get('/movies', getMov);

app.get('/meetup', getMeets);
//app.get('/hiking', getHiked);


// Get Location data
function getLocation(request, response){
  let searchHandler = {
    cacheHit: (data) => {
      console.log('from da databases');
      // console.log('getLocation Server data :', data)
      response.status(200).send(data);
    },
    cacheMiss: (query) => {
      return searchLocation(query)
        .then(result => {
          // console.log('getLocation Server data :', result)
          response.send(result);
        }).catch(err=>console.error(err));
    }
  }
  lookForLocation(request.query.data, searchHandler);
}

function lookForLocation (query, handler) {
  const SQL = 'SELECT * FROM locations WHERE search_query=$1';
  const values = [query];
  return client.query(SQL, values)
    .then(data => {
      if(data.rowCount){
        console.log('from teh dataBass');
        handler.cacheHit(data.rows[0]);
      }else {
        handler.cacheMiss(query);
      }
    }).catch(err => console.error(err));
}

function searchLocation (query){
  const URL = `https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${process.env.GEOCODE_API_KEY}`;

  return superAgent.get(URL)
    .then(result => {
      console.log('from teh googs');
      let location = new Location(result.body.results[0]);
      let SQL = `INSERT INTO locations 
        (search_query, formatted_query, latitude, longitude)
        VALUES($1, $2, $3, $4)
        RETURNING id`;

      return client.query(SQL, [query, location.formatted_query, location.latitude, location.longitude])
        .then((result) => {
          console.log(result);
          console.log('stored to DB');
          location.id = result.rows[0].id
          return location;//sends with a successful storage
        }).catch(err => console.error(err));
    });
}

function Location(location, query){
  this.search_query = query;
  this.formatted_query = location.formatted_address;
  this.latitude = location.geometry.location.lat;
  this.longitude = location.geometry.location.lng;
}

function searchWeather(query){
  const url = `https://api.darksky.net/forecast/${process.env.DARKSKY_API_KEY}/${query.latitude},${query.longitude}`;
  // body.results.geometry.location. lat || lng
  // console.log(url);
  const SQL = 'SELECT * FROM weathers WHERE location_id=$1'
  return client.query(SQL, [query.id])
    .then(result => {
      if(!result.rowCount){
        console.log('gonna go get stuff from the weather api');
        return superAgent.get(url)
          .then(weatherData => {
            let wArr = weatherData.body.daily.data.map(
              forecast => {
                let data = {};
                data.forecast = forecast.summary;
                data.time = new Date(forecast.time * 1000).toDateString();
                return data;
              }
            );
            // ==================
            //put weather data in the db
            // =====================
            wArr.forEach(forecast => {
              //insert the forecast into DB
              console.log('storing a forecast');
              const SQL = 'INSERT INTO weathers (forecast, time, created_at, location_id) VALUES($1, $2, $3, $4)';
              const values = [forecast.forecast, forecast.time, Date.now(), query.id]
              client.query(SQL, values)
                .catch(err => {
                  console.log('========== error from weather ===========')
                  console.error(err);
                });
            })

            return wArr;
          })
          .catch(err => {
            console.log('========== error from weather ===========')
            console.log(err);
          })
      } else {
        console.log('found stuff in the db for weather');
        if (Date.now() - result.rows[0].created_at > timeouts.weather ){

          console.log('data too old, invalidating');
          const SQL = 'DELETE FROM weathers WHERE location_id=$1'
          const values=[query.id];

          return client.query(SQL, values)
            .then(() => {
              return superAgent.get(url)
                .then(weatherData => {
                  let wArr = weatherData.body.daily.data.map(
                    forecast => {
                      let data = {};
                      data.forecast = forecast.summary;
                      data.time = new Date(forecast.time * 1000).toDateString();
                      return data;
                    }
                  );
                  // ==================
                  //put weather data in the db
                  // =====================
                  wArr.forEach(forecast => {
                    //insert the forecast into DB
                    console.log('storing a forecast');
                    const SQL = 'INSERT INTO weathers (forecast, time, created_at, location_id) VALUES($1, $2, $3, $4)';
                    const values = [forecast.forecast, forecast.time, Date.now(), query.id]
                    client.query(SQL, values)
                      .catch(err => {
                        console.log('========== error from weather ===========')
                        console.error(err);
                      });
                  })
                  return wArr;
                })
            })


        }
        return result.rows;
      }
    })

  // how to pull lat/long from google API, then format so we can input it into this URL

    .catch(err => {
      console.log('========== error from weather ===========')
      console.error(err)
    });
}

//movies-----------------------------
//mov func
function getMov (request, response) {
  return searchMovs(request.query.data)
    .then(movData => {
      response.send(movData);}
    );
}
function searchMovs(query) {
  const url = `https://api.themoviedb.org/3/search/movie?api_key=${process.env.MOVIE_API_KEY}&query=${query}`;
  return superAgent.get(url)
    .then(moviesData => {
      // console.log(query);
      return moviesData.body.results.map(movie => new Movie(movie));
    });
}
function Movie(movie) {
  this.title = movie.title;
  this.overview = movie.overview;
  this.average_votes = movie.vote_average;
  this.total_votes = movie.vote_count;
  if (movie.poster_path) {
    this.image_url = `http://image.tmdb.org/t/p/w200_and_h300_bestv2${movie.poster_path}`;
  } else {
    this.image_url = null;
  }
  this.popularity = movie.popularity;
  this.released_on = movie.release_date;
}
//yelp-----------------------------------------------------------------------------------------------
function getYelp (request, response){
  return searchYelps(request.query.data)
    .then(yelpData => {
      response.send(yelpData);}
    );
}
function searchYelps(query) {
  const url = `https://api.yelp.com/v3/businesses/search?term=delis&latitude=${query.latitude}&longitude=${query.longitude}`;
  return superAgent.get(url)
    .set('Authorization', `Bearer ${process.env.YELP_API_KEY}`)
    .then(yelpData => {
      // console.log(yelpData.body.businesses);
      return yelpData.body.businesses.map(bsns => new Bsns(bsns));
    })
    .catch(err => console.error(err));
}
function Bsns (bsns){
  this.name = bsns.name;
  this.image_url = bsns.image_url;
  this.price = bsns.price;
  this.rating = bsns.rating;
  this.url = bsns.url;
}

// Meetup https://www.meetup.com/meetup_api/docs/
function getMeets (req, res){
  return searchMeets(req.query.data)
  .then(meetData => {
    res.send(meetData);}
  );
}

function searchMeets(query) {
  const url=`https://api.meetup.com/2/events?key=${process.env.MEETUP_API_KEY}&group_urlname=CodeFellows&sign=true&lat=${query.latitude}&lon=${query.longitude}&category=coding&total_count=10`;
  const SQL = 'SELECT * FROM meetups where location_id=$1';
    return client.query(SQL, [query.id])
      .then(result => {
        if(!result.rowCount){
          console.log('gettin stuff for Meets');
          return superAgent.get(url)
            .then(meetData => {
              let meetsArr = meetData.body.results.map(meeting => {
                let data = {};
                data.link = meeting.link; // link issue?
                data.name = meeting.name;
                data.creation_date = new Date (meeting.time * 1000).toDateString();
                data.host = meeting.host;
                console.log(data);
                return data;
              }
            );
              // put meeting data in DB
            meetsArr.forEach(meeting => {
              console.log('storing a meetup');
              const SQL = 'INSERT INTO meetups (link, name, creation_date, meeting, location_id) VALUES($1, $2, $3, $4, $5)';
              const values = [meeting.link, meeting.name, Date.now(), query.id]
              client.query(SQL, values)
                .catch(err => {
                  console.log('======= dis error from meets =======')
                  console.error(err);
                });
            })
            return meetsArr;
          })
          .catch(err => {
            console.log('======= dis error from meets =======')
            console.log(err)
          })
      } else {
        console.log('found info in DB for meets');
        // CACHE INVALIDATION likely goes here
        return result.rows;
      }
    })
    .catch(err => {
    console.log('======= dis error from meets =======')
    console.error(err)
    });
}

function Meeting (meeting) {
  this.link = meeting.link;
  this.name = meeting.name;
  this.creation_date = meeting.creation_date;
  this.host = meeting.host;
}
/* properties
link
name
creation_date
host
*/

// Hiking https://www.hikingproject.com/data
function getHiked (req, res) {
  return searchHike(req.query.data)
  .then(hikeData => {
    res.send(hikeData);}
  );
}

function searchHike(query) {
  const url=`https://www.hikingproject.com/data/get-trails?lat=${lat}&lon=${lon}&maxDistance=20&key=${process.env.HIKING_API_KEY}`;
  const SQL = 'SELECT * FROM hiking WHERE location_id=$1';
    return client.query(SQL, [query.id])
      .then(result => {
        if(!result.rowCount){
          console.log('going on a hike');
          return superAgent.get(url)
            .then(hikeData => {
              let hikeArr = hikedata.body.results.map(hike => {
                let data = {};
                data.name = hike.name;
                data.location = hike.location;
                data.length = hike.length;
                data.stars = hike.stars;
                data.star_votes = hike.star_votes;
                data.summary = hike.summary;
                data.trail_url = hike.trail_url;
                data.conditions = hike.conditions;
                data.condition_date = new Date(hike.condition_time *1000).toDateString();
                data.condition_time = hike.condition_time;
              }
            );
            // put hike data in DB
            hikeArr.forEach(hiking => {
              console.log('storing hike');
              const SQL = 'INSERT INTO hiking (name, location, length, stars, star_votes, summary, trail_url, conditions, condition_date, condition_time) VALUES($1, $2, $3, $4, $5)';
              const values = [hiking.name, hiking.location, hiking.length, hiking.stars, hiking.star_votes, hiking.summary, hiking.trail_url, hiking.conditions, Date.now(), hiking.condition_time, query.id]
              client.query(SQL, values)
                .catch(err => {
                  console.log('====== this error from hiking ========')
                  console.error(err);
                });
            })
            return hikeArr;
          })
          .catch(err => {
            console.log('====== this error from hiking ========')
            console.error(err)
          })
      } else {
        console.log('found hiking info in DB')
        // CACHE INVALIDATION likely goes here
        return result.rows
      }
    })
    .catch(err => {
      console.log('====== this error from hiking ========')
      console.error(err);
    });
}

function Hike () {} // leHikeConstruct
/* properties
name
loction
length
stars
star_votes
summary
trail_url
conditions
condition_date
condition_time
*/

// Error messages
app.get('/*', function(req, res) {
  res.status(404).send('halp, you are in the wrong place');
});

function errorMessage(res, path){
  res.status(500).send('something went wrong. plzfix.');
} //created a function to handle the 500 errors but not sure what to do with it

app.listen(PORT, () => {
  console.log(`app is up on port : ${PORT}`);
});
