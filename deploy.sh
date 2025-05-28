#!/bin/bash

echo "🔄 Starting rebuild and deployment..."

# Build the React app
echo "📦 Building React app..."
npm run build:app

if [ $? -ne 0 ]; then
    echo "❌ Build failed!"
    exit 1
fi

# Build CSS
echo "🎨 Building CSS..."
npm run build:css

# Copy files to web root
echo "📁 Copying files to web root..."
cp -r build/* .

# Create directories for SPA routing (React Router support)
echo "🗂️  Creating SPA route directories..."
mkdir -p tiktok tiktok/donation tiktok/end activitywatch activitywatch/donation activitywatch/end

# Copy index.html to all route directories for SPA support
echo "📄 Setting up SPA routing..."
cp index.html tiktok/index.html
cp index.html tiktok/donation/index.html
cp index.html tiktok/end/index.html
cp index.html activitywatch/index.html
cp index.html activitywatch/donation/index.html
cp index.html activitywatch/end/index.html

# Set permissions
echo "🔐 Setting permissions..."
chmod -R 755 static/ tiktok/ activitywatch/ 2>/dev/null || true
chmod 644 *.html *.json *.txt *.png *.ico *.svg *.whl *.gz 2>/dev/null || true
chmod 644 tiktok/*.html tiktok/*/*.html activitywatch/*.html activitywatch/*/*.html 2>/dev/null || true

echo "✅ Deployment complete!"
echo "🌐 Your app should now be updated at https://datadonation.oii.ox.ac.uk/"
echo "📱 All routes should now work:"
echo "   • https://datadonation.oii.ox.ac.uk/"
echo "   • https://datadonation.oii.ox.ac.uk/activitywatch"
echo "   • https://datadonation.oii.ox.ac.uk/activitywatch/donation"
echo "   • https://datadonation.oii.ox.ac.uk/activitywatch/end"
echo "   • https://datadonation.oii.ox.ac.uk/tiktok"
echo "   • https://datadonation.oii.ox.ac.uk/tiktok/donation"
echo "   • https://datadonation.oii.ox.ac.uk/tiktok/end" 