using Bogus;
using taskmaster_pro.Infrastructure.Persistence.Contexts.Entities;
using taskmaster_pro.Infrastructure.Shared.Mock;

namespace taskmaster_pro.Infrastructure.Persistence.SeedData
{
    public class DatabaseSeeder
    {
        private readonly ApplicationDbContext _db;

        public DatabaseSeeder(ApplicationDbContext dbContext)
        {
            _db = dbContext ?? throw new ArgumentNullException(nameof(dbContext));
        }

        /// <summary>
        /// Generate & seed data. This is the single source of seeding logic.
        /// </summary>
        /// <param name="rowOrders">how many orders to create</param>
        /// <param name="rowSchedules">how many schedules to create</param>
        /// <param name="seed">bogus seed for determinism (optional)</param>
        /// <param name="wipeExisting">delete existing schedules then orders first (dev only)</param>
        public async Task GenerateAndSeedAsync(int rowOrders = 50, int rowSchedules = 200, int seed = 2000, bool wipeExisting = false)
        {
            if (rowOrders <= 0) throw new ArgumentException("rowOrders must be > 0", nameof(rowOrders));
            if (rowSchedules < 0) throw new ArgumentException("rowSchedules must be >= 0", nameof(rowSchedules));

            if (!wipeExisting)
            {
                var hasOrders = await _db.Orders.AnyAsync();
                var hasSchedules = await _db.Schedules.AnyAsync();
                if (hasOrders && hasSchedules)
                    return;
            }

            Randomizer.Seed = new Random(seed);
            // WARNING: Wipe only in dev. This deletes data irreversibly.
            if (wipeExisting)
            {
                await _db.Database.ExecuteSqlRawAsync("DELETE FROM dbo.Schedules");
                await _db.Database.ExecuteSqlRawAsync("DELETE FROM dbo.Orders");
            }

            // Acquire user ids to attach to created rows. If none, throw because users required for seeding logic.
            var userIds = await _db.Users.AsNoTracking().Select(u => u.Id).Take(1000).ToListAsync();
            if (userIds == null || userIds.Count == 0)
                throw new InvalidOperationException("No users found in DB. Create at least one user before seeding.");

            // Unique run tag to locate the exact rows inserted by this run after SaveChanges — solves DB-generated ID issues
            var runTag = "seeder_" + Guid.NewGuid().ToString("N");
            var utcNow = DateTime.UtcNow;

            List<Order> orders = new();

            // Orders: only seed if empty (or when wiped)
            if (!await _db.Orders.AnyAsync())
            {
                // Deterministic RNG for Bogus if you want same data each run
                Randomizer.Seed = new Random(seed);

                // --- Generate Orders (in-memory) ---
                var orderFaker = new OrderBogusConfig(userIds, createdBy: runTag, createdAt: utcNow);
                orders = orderFaker.Generate(rowOrders);

                // --- Seed Orders first ---
                await _db.Orders.AddRangeAsync(orders);
                await _db.SaveChangesAsync();
            }

            // --- Read back the actual seeded Order IDs ---
            // Use CreatedBy runTag to select only the rows inserted by this run.
            var seededOrderIds = await _db.Orders
                .AsNoTracking()
                .Where(o => o.CreatedBy == runTag)
                .Select(o => o.Id)
                .ToListAsync();

            // If for some reason CreatedBy isn't available (schema mismatch) or provider ignored client ids,
            // Fallback to last inserted by Created timestamp.
            if (seededOrderIds == null || seededOrderIds.Count == 0)
            {
                seededOrderIds = await _db.Orders
                    .AsNoTracking()
                    .OrderByDescending(o => o.Created)
                    .Take(orders.Count)
                    .Select(o => o.Id)
                    .ToListAsync();
            }

            if (seededOrderIds == null || seededOrderIds.Count == 0)
                throw new InvalidOperationException("Unable to determine seeded Order IDs after inserting orders.");

            // Schedules: only seed if empty (or when wiped)
            if (!await _db.Schedules.AnyAsync())
            {
                // Build mapping of seeded orders -> their OrderDate so schedules can be realistic (+/- 30 days around order date)
                var seededOrders = await _db.Orders
                    .AsNoTracking()
                    .Where(o => seededOrderIds.Contains(o.Id))
                    .Select(o => new { o.Id, o.OrderDate })
                    .ToListAsync();

                var orderDateMap = seededOrders.ToDictionary(x => x.Id, x => x.OrderDate);
                
                // --- Generate Schedules using seededOrderIds ---
                Randomizer.Seed = new Random(seed + 1);

                // Pass orderDateMap into ScheduleBogusConfig
                var scheduleFaker = new ScheduleBogusConfig(seededOrderIds, userIds, orderDateMap, createdBy: runTag, createdAt: utcNow);
                var domainSchedules = scheduleFaker.Generate(rowSchedules);

                // Map domain → entity
                var entitySchedules = domainSchedules.Select(s => new ScheduleEntity
                {
                    Id = s.Id,
                    Title = s.Title,
                    OrderId = s.OrderId,
                    ScheduledStart = s.ScheduledStart,
                    ScheduledEnd = s.ScheduledEnd,
                    Description = s.Description,
                    AssignedToId = s.AssignedToId,
                    UserId = s.UserId,
                    Created = s.Created,
                    CreatedBy = s.CreatedBy,
                    Updated = s.Updated,
                    UpdatedBy = s.UpdatedBy
                }).ToList();

                // --- Seed schedules ---
                await _db.Schedules.AddRangeAsync(entitySchedules);
                await _db.SaveChangesAsync();
            }
        }
    }
}