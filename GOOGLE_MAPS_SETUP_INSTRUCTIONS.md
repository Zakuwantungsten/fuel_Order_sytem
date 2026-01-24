# Google Maps Fleet Tracking Setup Instructions

## 🗺️ Overview
The Fleet Tracking feature now displays checkpoints on an interactive Google Maps interface with clickable markers showing truck counts.

## 📋 Setup Steps

### 1. Get Google Maps API Key

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable **Maps JavaScript API**
4. Go to **Credentials** → **Create Credentials** → **API Key**
5. (Optional) Restrict the API key to your domain for security

### 2. Configure the API Key

**Option A: Environment Variable (Recommended)**
```bash
# In frontend/.env file
VITE_GOOGLE_MAPS_API_KEY=your_actual_api_key_here
```

**Option B: In-App Configuration**
- Open the Fleet Tracking page
- Enter your API key in the prompt
- Key will be saved to localStorage

### 3. Update Checkpoint Coordinates (Backend)

If checkpoints don't have coordinates yet, run:

```bash
cd backend
npm run seed:checkpoints
```

This will populate all 65 checkpoints with GPS coordinates.

## 🎨 Features

### Interactive Map
- **700px height** full-screen map view
- **Zoom level 6** - Shows Kenya/Tanzania/Zambia/DRC region
- **Centered at** Tanzania/Zambia border (-8.0, 31.5)

### Checkpoint Markers
- **Blue circles (large)** - Major checkpoints with trucks
- **Green circles (medium)** - Minor checkpoints with trucks
- **Gray circles (small)** - Checkpoints with no trucks
- **Number inside** - Truck count at that checkpoint
- **Hover** - Shows checkpoint name and instruction

### Copy Functionality
- **Click any marker** with trucks to copy truck list to clipboard
- **Green checkmark** appears briefly after copying
- Uses the existing copy API endpoint with comma format

### Legend
- Color-coded legend at bottom of map
- Shows major/minor/empty checkpoint indicators

## 🔧 Technologies Used

- **@vis.gl/react-google-maps** - Modern React Google Maps wrapper
- **Google Maps API** - Base map and marker rendering
- **AdvancedMarker** - Custom styled markers with HTML content

## 📱 Responsive Design

The map automatically adjusts to container width while maintaining 700px height for optimal viewing.

## 🔐 Security Notes

**Important:** Never commit your API key to version control!

Add to `.gitignore`:
```
frontend/.env
frontend/.env.local
```

For production, set the API key as an environment variable in your hosting platform.

## 🐛 Troubleshooting

### Map not loading?
- Check browser console for errors
- Verify API key is correct
- Ensure Maps JavaScript API is enabled in Google Cloud

### Markers not showing?
- Run checkpoint seed script
- Check that checkpoints have `coordinates` field in database
- Verify checkpoint API returns coordinates

### Copy not working?
- Ensure you have a snapshot selected
- Check that trucks exist at the clicked checkpoint
- Browser must support Clipboard API

## 🎯 Next Steps (Optional Enhancements)

- Add polylines connecting checkpoints to show route
- Implement clustering for overlapping markers
- Add truck icons between checkpoints for in-transit visualization
- Custom map styling to match app theme
- Filter by direction (GOING/RETURNING)
- Real-time truck position updates via WebSocket

---

**Deployment Complete:** Your fleet tracking now has a beautiful map interface! 🚛🗺️
