// ============================================================
// Routes — all routes wired together
// ============================================================
import { Router } from 'express';
import { authenticate } from '../middleware/auth';

// Controllers
import { AuthController, authValidation } from '../controllers/AuthController';
import { CountryController } from '../controllers/CountryController';
import { ResourceController, resourceValidation } from '../controllers/ResourceController';
import { KnowledgeController, knowledgeValidation } from '../controllers/KnowledgeController';
import { PolicyController, policyValidation } from '../controllers/PolicyController';
import { ProductionController, productionValidation } from '../controllers/ProductionController';
import { MarketController, marketValidation } from '../controllers/MarketController';
import { EconomyController } from '../controllers/EconomyController';
import { GlobalEventController, eventValidation } from '../controllers/GlobalEventController';

const router = Router();

// ── Auth ─────────────────────────────────────────────────────
router.post('/auth/register', authValidation.register, AuthController.register);
router.post('/auth/login',    authValidation.login,    AuthController.login);
router.get('/auth/me',        authenticate,             AuthController.me);

// ── Countries ────────────────────────────────────────────────
router.get('/countries',          CountryController.getAll);
router.get('/countries/me',       authenticate, CountryController.getMyCountry);
router.get('/countries/me/history', authenticate, CountryController.getEconomyHistory);
router.get('/countries/:id',      CountryController.getById);

// ── Resources ────────────────────────────────────────────────
router.get('/resources',              authenticate, ResourceController.getResources);
router.post('/resources/explore',     authenticate, resourceValidation.explore, ResourceController.exploreResource);

// ── Knowledge ────────────────────────────────────────────────
router.get('/knowledge',                    authenticate, KnowledgeController.getKnowledge);
router.get('/knowledge/types',              KnowledgeController.getTypes);           // public — no auth
router.get('/knowledge/:type',              authenticate, KnowledgeController.getKnowledgeByType);
router.post('/knowledge/add',               authenticate, knowledgeValidation.add,      KnowledgeController.addKnowledge);
router.post('/knowledge/research',          authenticate, knowledgeValidation.research, KnowledgeController.research);
router.post('/knowledge/check',             authenticate, knowledgeValidation.check,    KnowledgeController.checkRequirements);

// ── Policies ─────────────────────────────────────────────────
router.get('/policies',               authenticate, PolicyController.getPolicies);
router.get('/policies/catalog',       authenticate, PolicyController.getCatalog);
router.get('/policies/allocation',    authenticate, PolicyController.getAllocation);
router.put('/policies/allocation',    authenticate, policyValidation.allocation, PolicyController.setAllocation);
router.post('/policies/propose',      authenticate, policyValidation.propose, PolicyController.proposePolicy);
router.post('/policies/:id/enact',    authenticate, PolicyController.enactPolicy);
router.post('/policies/:id/repeal',   authenticate, PolicyController.repealPolicy);

// ── Production ───────────────────────────────────────────────
router.get('/production/recipes',     authenticate, ProductionController.getRecipes);
router.get('/production/orders',      authenticate, ProductionController.getOrders);
router.get('/production/orders/active', authenticate, ProductionController.getActiveOrders);
router.post('/production/craft',      authenticate, productionValidation.craft, ProductionController.craftItem);

// ── Market ───────────────────────────────────────────────────
router.get('/market',                 authenticate, MarketController.getListings);
router.get('/market/my',              authenticate, MarketController.getMyListings);
router.get('/market/transactions',    authenticate, MarketController.getTransactions);
router.get('/market/price/:resourceType', authenticate, MarketController.getDynamicPrice);
router.post('/market/list',           authenticate, marketValidation.list, MarketController.listItem);
router.post('/market/buy/:listingId', authenticate, MarketController.buyItem);
router.delete('/market/:listingId',   authenticate, MarketController.cancelListing);

// ── Economy ──────────────────────────────────────────────────
router.post('/economy/tick',          authenticate, EconomyController.triggerTick);
router.post('/economy/tick/me',       authenticate, EconomyController.tickMyCountry);

// ── Global Events ────────────────────────────────────────────
router.get('/events',                 authenticate, GlobalEventController.getActiveEvents);
router.get('/events/:id',             authenticate, GlobalEventController.getEvent);
router.post('/events/:id/respond',    authenticate, eventValidation.respond, GlobalEventController.respondToEvent);
router.post('/events/trigger',        authenticate, GlobalEventController.triggerRandom);

export default router;
