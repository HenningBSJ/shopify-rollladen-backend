Set-Location "C:\Projects\Shopify\backend"
$env:NODE_ENV = "production"
node -r dotenv/config src/index.js