using Microsoft.AspNetCore.Authorization;
using taskmaster_pro.Application.Features.Dashboard.Queries.GetDashboard;
using static taskmaster_pro.Application.Features.Dashboard.Queries.GetDashboard.GetDashboardStatsQuery;

namespace Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class DashboardController : ControllerBase
    {
        #region Fields

        private readonly IMediator _mediator;

        #endregion

        #region Constructor

        public DashboardController(
            IMediator mediator)
        {
            _mediator = mediator;
        }

        #endregion

        #region Public Methods

        // Returns dashboard statistics for a given year
        [HttpGet("stats")]
        public async Task<ActionResult<DashboardStatsDto>> GetStats([FromQuery] int? year)
        {
            var targetYear = year ?? DateTime.UtcNow.Year;
            var stats = await _mediator.Send(new GetDashboardStatsQuery(targetYear));
            return Ok(stats);
        }

        #endregion
    }
}