using System.ComponentModel.DataAnnotations;

namespace taskmaster_pro.Application.Features.Authentication.DTOs
{
    public class ResendConfirmationDto
    {
        [Required, EmailAddress, StringLength(254)]
        public string Email { get; set; } = default!;
        [Required]
        public string RecaptchaToken { get; set; }
    }
}
