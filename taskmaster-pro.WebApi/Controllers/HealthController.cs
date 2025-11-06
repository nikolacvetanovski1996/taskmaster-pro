using StackExchange.Redis;

namespace Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class HealthController : ControllerBase
    {
        #region Fields

        private readonly IConnectionMultiplexer _redis;

        #endregion

        #region Constructor

        public HealthController(IConnectionMultiplexer redis)
        {
            _redis = redis;
        }

        #endregion

        #region Public Methods

        // Basic health check endpoint - responds with plain "Healthy"
        [HttpGet("check")]
        [HttpHead("check")]
        public IActionResult CheckHealth()
        {
            return Ok("Healthy");
        }

        // Pings Redis to verify connectivity and measure latency
        [HttpGet("redis-check")]
        [HttpHead("redis-check")]
        public async Task<IActionResult> RedisCheck()
        {
            try
            {
                var db = _redis.GetDatabase();
                var pong = await db.PingAsync();

                return Ok(new
                {
                    status = "ok",
                    redisPingMs = pong.TotalMilliseconds
                });
            }
            catch (Exception ex)
            {
                // Return 503 Service Unavailable with error message if Redis ping fails
                return StatusCode(503, new { status = "error", message = ex.Message });
            }
        }

        #endregion
    }
}