# trip-planner-app

Add waypoints to a map and decorate each point with attributes

# v1.0.1

## Features

- ✓ enter a location and marker is immediately created at that location
- ✓ a line connects the markers in the sequence they are created
- ✓ move, remove, reorder stops
- ✓ import/export trip data
- ✓ annotate markers (shower, campground, etc.)
- ✓ user-defined annotations (text, description, arrival, departure date)
- ✓ decorate a stop as optional (different color marker)
- ✓ open google maps for directions from prior stop
- ✓ ability to insert a waypoint
- ✓ ability to navigate forward/backward
- ✓ show day-name for arrival/departure dates
- ✓ navigate forward/backward in detail viewer
- ☐ annotation symbol appears as a colored circle on the marker itself
- ✓ PWA with cache-first access
- ☐ backup to Fauna
- ☐ provide an app key and it sets the Fauna, google API and mapify keys in the client (requires Netlify lambda)
- ☐ add a stop with long-press popup
- ✓ center map at current location/show current location
- ✓ track location: show marker at current location

## Issues

☐ How to create a netlify lambda with secret keys without exposing them via github in a public project?
☐ Netlify has variables so I guess the node code leverages those plus Fauna to store secure configuration

## Fixes

- ✓ select feature closest to prior stop
- ✓ use google geocoder instead of geoapify
