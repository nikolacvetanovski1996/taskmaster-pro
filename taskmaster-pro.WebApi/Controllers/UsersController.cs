using Microsoft.AspNetCore.Authorization;
using System.Linq;
using System.Security.Claims;
using taskmaster_pro.Application.Features.Authentication.DTOs;
using taskmaster_pro.Application.Features.Users.Commands.ChangePassword;
using taskmaster_pro.Application.Features.Users.Commands.UpdateMyProfile;
using taskmaster_pro.Application.Features.Users.DTOs;
using taskmaster_pro.Application.Features.Users.Queries.GetMyProfile;
using taskmaster_pro.Application.Features.Users.Queries.SearchUsers;
using taskmaster_pro.Application.Features.Users.Queries.UserExists;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class UsersController : ControllerBase
{
    #region Fields

    private readonly IMediator _mediator;

    #endregion

    #region Constructor

    public UsersController(IMediator mediator)
    {
        _mediator = mediator;
    }

    #endregion

    #region Public Methods

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var userViewModel = await _mediator.Send(new Features.Users.Queries.GetUserById.GetUserByIdQuery(id));
        if (userViewModel == null) return NotFound();
        return Ok(userViewModel);
    }

    // Returns the currently logged-in user's profile with basic info + roles
    [HttpGet("me")]
    public async Task<IActionResult> GetMyProfile()
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrWhiteSpace(userId)) return Unauthorized();

        var profile = await _mediator.Send(new GetMyProfileQuery { UserId = userId });
        if (profile == null)
            return NotFound();

        return Ok(profile);
    }

    // Updates the logged-in user's profile (first name, last name, email)
    [HttpPut("me")]
    public async Task<IActionResult> UpdateMyProfile(UpdateProfileDto model)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrWhiteSpace(userId)) return Unauthorized();

        var command = new UpdateMyProfileCommand
        {
            UserId = userId,
            FirstName = model.FirstName,
            LastName = model.LastName,
            Email = model.Email
        };

        await _mediator.Send(command);

        return Ok(new { Message = "Profile updated" });
    }

    // Allows the logged-in user to change their password
    [HttpPost("change-password")]
    public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordDto dto)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrWhiteSpace(userId)) return Unauthorized();

        var command = new ChangePasswordCommand
        {
            UserId = userId,
            CurrentPassword = dto.CurrentPassword,
            NewPassword = dto.NewPassword
        };

        try
        {
            await _mediator.Send(command);
            return Ok();
        }
        catch (ValidationException ex)
        {
            return BadRequest(new
            {
                errors = ex.Errors.Select(e => new { message = e })
            });
        }
    }

    // Searches users by email, first name, last name, or full name (for autocomplete)
    [HttpGet("search")]
    public async Task<ActionResult<List<UserDto>>> Search([FromQuery] string query)
    {
        var users = await _mediator.Send(new SearchUsersQuery { Query = query });
        return Ok(users);
    }

    // Checks if a user with the given Id exists
    [HttpGet("{id}/exists")]
    public async Task<ActionResult<bool>> Exists(string id)
    {
        var query = new UserExistsQuery { UserId = id };

        // Validate input using FluentValidation
        var exists = await _mediator.Send(query);

        return Ok(exists);
    }

    #endregion
}