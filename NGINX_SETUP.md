# Nginx Configuration for Data Donation Platform

## Problem
When users directly access URLs like `https://datadonation.oii.ox.ac.uk/activitywatch` or `https://datadonation.oii.ox.ac.uk/tiktok`, nginx returns a 404 error because it tries to find physical files at those paths. This is a common issue with Single Page Applications (SPAs) where routing is handled client-side by React Router.

## Solution
Configure nginx to serve `index.html` for all routes that don't correspond to actual files, allowing React Router to handle the routing client-side.

## Implementation Options

### Option 1: Use the provided nginx.conf file
1. Copy the `nginx.conf` file from this project to your nginx sites directory:
   ```bash
   sudo cp nginx.conf /etc/nginx/sites-available/datadonation
   sudo ln -s /etc/nginx/sites-available/datadonation /etc/nginx/sites-enabled/
   ```

2. Remove the default site if it conflicts:
   ```bash
   sudo rm /etc/nginx/sites-enabled/default
   ```

3. Test the configuration:
   ```bash
   sudo nginx -t
   ```

4. Reload nginx:
   ```bash
   sudo systemctl reload nginx
   ```

### Option 2: Add to existing nginx configuration
If you already have an nginx configuration for this site, add this location block to your existing server block:

```nginx
location / {
    try_files $uri $uri/ /index.html;
}
```

### Option 3: Minimal configuration
If you just need the basic SPA routing fix, add this to your existing server block:

```nginx
server {
    listen 80;
    server_name datadonation.oii.ox.ac.uk;
    root /var/www/datadonation-metl;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

## Key Points

1. **The `try_files` directive** is the crucial part:
   - `$uri` - Try the exact URI first
   - `$uri/` - Try the URI as a directory
   - `/index.html` - Fallback to index.html for SPA routing

2. **Static assets** should be handled separately to avoid unnecessary processing:
   ```nginx
   location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
       expires 1y;
       add_header Cache-Control "public, immutable";
       try_files $uri =404;
   }
   ```

3. **Security headers** are included in the provided configuration for better security.

## Testing
After applying the configuration:

1. Test direct links:
   - `https://datadonation.oii.ox.ac.uk/activitywatch`
   - `https://datadonation.oii.ox.ac.uk/tiktok`

2. Verify static assets still load correctly
3. Check that the React app routing works as expected

## Alternative for Apache
If you're using Apache instead of nginx, use the provided `.htaccess` file in the web root directory.

## Troubleshooting

- **404 still occurs**: Check that the nginx configuration is properly loaded and the server block is active
- **Static assets not loading**: Verify the static assets location block comes before the catch-all location block
- **SSL issues**: Update the SSL certificate paths in the HTTPS server block
- **Permission issues**: Ensure nginx has read access to the web root directory and all files 