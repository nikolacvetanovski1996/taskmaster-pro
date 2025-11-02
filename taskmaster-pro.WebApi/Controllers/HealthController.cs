using Features.Admin.Commands.ChangeUserRole;
using Microsoft.AspNetCore.Authorization;
using taskmaster_pro.Application.Features.Admin.Commands;
using taskmaster_pro.Application.Features.Admin.Commands.ResetSecurityAttempts;
using taskmaster_pro.Application.Features.Admin.Commands.UpdateUserRoles;
using taskmaster_pro.Application.Features.Admin.Queries.GetAdminUserById;
using taskmaster_pro.Application.Features.Admin.Queries.GetAllUsers;
using taskmaster_pro.Application.Features.Admin.Queries.GetPagedUsers;
using taskmaster_pro.Application.Features.Orders.Commands.DeleteOrder;
using taskmaster_pro.Application.Features.Orders.Queries.PagedOrders;
using taskmaster_pro.Application.Features.Schedules.Commands.DeleteSchedule;
using taskmaster_pro.Application.Features.Schedules.Queries.PagedSchedules;

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
        public IActionResult CheckHealth()
        {
            return Ok("Healthy");
        }

        #endregion
    }
}