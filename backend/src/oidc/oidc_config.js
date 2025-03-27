
const oidc_config = {
	authRequired: false,
	auth0Logout: true,
	secret: process.env.SERVER_OIDC_SECRET,
	baseURL: process.env.SERVER_OIDC_BASE_URL,
	clientID: process.env.SERVER_OIDC_CLIENT_ID,
	clientSecret: process.env.SERVER_OIDC_CLIENT_SECRET,
	issuerBaseURL: process.env.SERVER_OIDC_ISSUER_BASE_URL,
	authorizationParams: {
		response_type: 'code', // This requires to provide a client secret
		// audience: 'https://api.example.com/products',
		// scope: 'openid profile email read:products',
	},
};

module.exports = oidc_config;