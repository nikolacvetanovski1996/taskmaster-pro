namespace Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class HealthController : ControllerBase
    {
        #region Constructor

        public HealthController() { }

        #endregion

        #region Public Methods

        // Simple health check endpoint
        [HttpGet("check")]
        [HttpHead("check")]
        public IActionResult CheckHealth()
        {
            return Ok("Healthy");
        }

        #endregion
    }
}