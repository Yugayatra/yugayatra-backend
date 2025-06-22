# YugaYatra Backend Deployment

## Environment Variables Required:

```
NODE_ENV=production
PORT=3000
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/yugayatra
JWT_SECRET=your-super-secret-random-key-12345678
FRONTEND_URL=https://yugayatraretail.in
```

## Steps after upload:
1. Set all environment variables in Railway dashboard
2. Deploy the service
3. Get the Railway URL
4. Update frontend to use this URL

## MongoDB Atlas Setup:
1. Go to mongodb.com/atlas
2. Create free account
3. Create free cluster
4. Create database user
5. Get connection string
6. Replace MONGODB_URI above 