using Features.Admin.Queries.GetPagedUsers;
using Features.Orders.Commands.CreateOrder;
using Features.Schedules.Commands.CreateSchedule;
using FluentValidation;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;
using StackExchange.Redis;
using System.IO;
using System.Linq;
using System.Security.Claims;
using System.Text;
using System.Text.Json.Serialization;
using taskmaster_pro.Application.Behaviours;
using taskmaster_pro.Application.Features.Admin.Commands.UpdateUserRoles;
using taskmaster_pro.Application.Features.Authentication.Commands.RegisterUser;
using taskmaster_pro.Application.Features.Dashboard.Queries.GetDashboard;
using taskmaster_pro.Application.Features.Orders.Commands.CreateOrder;
using taskmaster_pro.Application.Features.Schedules.Commands.CreateSchedule;
using taskmaster_pro.Application.Features.Users.Commands.ChangePassword;
using taskmaster_pro.Application.Helpers;
using taskmaster_pro.Application.Interfaces;
using taskmaster_pro.Application.Mappings;
using taskmaster_pro.Infrastructure.Persistence.Contexts.Entities;
using taskmaster_pro.Infrastructure.Persistence.IdentityServices;
using taskmaster_pro.Infrastructure.Persistence.Mappings;
using taskmaster_pro.Infrastructure.Shared.Services;
using taskmaster_pro.WebApi.Identity;
using taskmaster_pro.WebApi.Services;

try
{
    // ========================= BUILDER + LOGGING =========================
    var builder = WebApplication.CreateBuilder(args);
    var mailSettings = builder.Configuration.GetSection("MailSettings").Get<MailSettings>();

    Log.Logger = new LoggerConfiguration()
    .ReadFrom.Configuration(builder.Configuration)
    .Enrich.FromLogContext()
    .CreateLogger();
    builder.Host.UseSerilog(Log.Logger);
    Log.Information("Application startup services registration");

    // ================== APPLICATION LAYER (CQRS, MediatR, AutoMapper) ==================
    builder.Services.AddApplicationLayer();
    builder.Services.AddMediatR(cfg =>
        cfg.RegisterServicesFromAssemblies(
            typeof(CreateOrderCommandHandler).Assembly,
            typeof(CreateScheduleCommandHandler).Assembly,
            typeof(GetPagedUsersQueryHandler).Assembly,
            typeof(RegisterUserCommandHandler).Assembly,
            typeof(GetDashboardStatsQueryHandler).Assembly,
            typeof(ChangePasswordCommandHandler).Assembly
        )
    );  
    builder.Services.AddAutoMapper(
        cfg => { },
        typeof(OrderProfile).Assembly,
        typeof(ScheduleProfile).Assembly,
        typeof(AuthenticationProfile).Assembly,
        typeof(ScheduleEntityProfile).Assembly,
        typeof(UserProfile).Assembly
    );
    builder.Services.AddTransient(
        typeof(IPipelineBehavior<,>),
        typeof(ValidationBehavior<,>)
    );

    // ============ INFRASTRUCTURE (Persistence + Repositories + HttpContextAccessor + Shared + Recaptcha) =============
    builder.Services.Scan(selector => selector
        .FromAssembliesOf(typeof(IGenericRepositoryAsync<>))
        .AddClasses(classSelector => classSelector.AssignableTo(typeof(IGenericRepositoryAsync<>)))
        .AsImplementedInterfaces()  
        .WithTransientLifetime()
        );
    builder.Services.AddHttpClient();
    builder.Services.AddHttpContextAccessor();
    builder.Services.AddPersistenceInfrastructure(builder.Configuration);
    builder.Services.AddSharedInfrastructure(builder.Configuration);
    builder.Services.AddScoped<IUserRoleService, IdentityUserRoleService>();
    builder.Services.AddSessionService(builder.Configuration);
    var redisConnectionString = builder.Configuration.GetConnectionString("Redis") ??
                            builder.Configuration["Redis:Connection"];
    builder.Services.AddSingleton<IConnectionMultiplexer>(sp =>
        ConnectionMultiplexer.Connect(redisConnectionString)
    );

    // ================== IDENTITY + AUTHENTICATION ==================
    builder.Services.AddIdentity<ApplicationUser, IdentityRole>(options =>
    {
        options.Password.RequiredLength = 8;
        options.Password.RequireDigit = true;
        options.Password.RequireLowercase = true;
        options.Password.RequireUppercase = true;
        options.Password.RequireNonAlphanumeric = false;
        options.User.RequireUniqueEmail = true;
        options.SignIn.RequireConfirmedEmail = true;
    })
    .AddEntityFrameworkStores<ApplicationDbContext>()
    .AddDefaultTokenProviders()
    .AddErrorDescriber<CustomIdentityErrorDescriber>();

    builder.Services.AddAuthentication(options =>
    {
        options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
        options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
    })
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = builder.Configuration["JWTSettings:Issuer"],
            ValidAudience = builder.Configuration["JWTSettings:Audience"],
            IssuerSigningKey = new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes(builder.Configuration["JWTSettings:Key"])
            ),
            RoleClaimType = ClaimTypes.Role,
            NameClaimType = ClaimTypes.NameIdentifier
        };
    });

    // ================== AUTHORIZATION POLICIES ==================
    builder.Services.AddAuthorization(options =>
    {
        options.AddPolicy("AdminPolicy", policy =>
            policy.RequireRole("Admin"));
    });

    // ================== COOKIE AUTHENTICATION ==================
    builder.Services.ConfigureApplicationCookie(options =>
    {
        options.Events.OnRedirectToLogin = context =>
        {
            if (context.Request.Path.StartsWithSegments("/api") &&
                context.Response.StatusCode == 200)
            {
                context.Response.StatusCode = 401;
                return Task.CompletedTask;
            }
            context.Response.Redirect(context.RedirectUri);
            return Task.CompletedTask;
        };
    });

    builder.Services.AddScoped<IJwtTokenService, JwtTokenService>();

    // ================== EMAIL SENDER ==================
    builder.Services.AddTransient<IEmailSender>(sp =>
        new SmtpEmailSender(
            mailSettings.SmtpHost,
            mailSettings.SmtpPort,
            mailSettings.SmtpUser,
            mailSettings.SmtpPass,
            mailSettings.EmailFrom,
            mailSettings.DisplayName
        ));

    // ================== CONTROLLERS + VALIDATION ==================
    builder.Services.AddControllers().AddJsonOptions(opts =>
        {
            opts.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
        });
    builder.Services.AddControllersExtension();
    builder.Services.AddValidatorsFromAssemblies(new[] {
        typeof(CreateOrderCommandValidator).Assembly,
        typeof(CreateScheduleCommandValidator).Assembly,
        typeof(UpdateUserRolesCommandValidator).Assembly,
        typeof(RegisterUserCommandValidator).Assembly,
        typeof(ChangePasswordCommandValidator).Assembly
    });

    builder.Services.Configure<ApiBehaviorOptions>(options =>
    {
        options.InvalidModelStateResponseFactory = context =>
        {
            var errors = context.ModelState
                .Where(e => e.Value.Errors.Count > 0)
                .SelectMany(e => e.Value.Errors)
                .Select(e => e.ErrorMessage)
                .ToList();

            return new BadRequestObjectResult(new { errors });
        };
    });

    // ================== API DOCS (Swagger) + VERSIONING ==================
    builder.Services.AddApiVersioningExtension();
    builder.Services.AddEndpointsApiExplorer();
    builder.Services.AddVersionedApiExplorerExtension();
    builder.Services.AddSwaggerGen(c =>
    {
        c.SwaggerDoc("v1", new OpenApiInfo
        {
            Title = "TaskMaster Pro API",
            Version = "v1"
        });

        c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
        {
            Name = "Authorization",
            Type = SecuritySchemeType.Http,
            Scheme = "bearer",
            BearerFormat = "JWT",
            In = ParameterLocation.Header,
            Description = "Enter JWT Bearer token only",
        });

        c.AddSecurityRequirement(new OpenApiSecurityRequirement
        {
            {
                new OpenApiSecurityScheme
                {
                    Reference = new OpenApiReference
                    {
                        Type = ReferenceType.SecurityScheme,
                        Id = "Bearer"
                    },
                    Scheme = "bearer",
                    Name = "Authorization",
                    In = ParameterLocation.Header,
                },
                Array.Empty<string>()
            }
        });
    });
    builder.Services.AddMvcCore().AddApiExplorer();

    // ================== CORS + HEALTH CHECKS ==================
    var allowedOrigins = builder.Configuration
        .GetSection("Frontend:AllowedOrigins")
        .Get<string[]>();
    builder.Services.AddCors(options =>
    {
        options.AddPolicy("AllowFrontend", policy =>
        {
            policy.WithOrigins(allowedOrigins)
                .AllowAnyHeader()
                .AllowAnyMethod();
        });
    });
    builder.Services.AddHealthChecks();

    // ================== UTILITIES ==================
    builder.Services.AddScoped(typeof(IDataShapeHelper<>), typeof(DataShapeHelper<>));

    // ================== APP BUILD ==================
    var app = builder.Build();
    Log.Information("Application startup middleware registration");

    // ================== DATABASE MIGRATION ==================
    using var scope = app.Services.CreateScope();
    var services = scope.ServiceProvider;
    var db = services.GetRequiredService<ApplicationDbContext>();
    var logger = services.GetRequiredService<ILogger<Program>>();
    if (builder.Environment.IsDevelopment())
    {
        // Only auto-migrate in Development
        db.Database.Migrate();
    }

    // ================== IDENTITY SEEDER ==================
    try
    {
        var roleManager = services.GetRequiredService<RoleManager<IdentityRole>>();
        var userManager = services.GetRequiredService<UserManager<ApplicationUser>>();
        var config = services.GetRequiredService<IConfiguration>();
        var identitySeeder = new IdentitySeeder(roleManager, userManager, config);
        await identitySeeder.SeedAsync();
        logger.LogInformation("IdentitySeeder completed.");
    }
    catch (Exception ex)
    {
        var logger2 = services.GetRequiredService<ILogger<Program>>();
        logger2.LogError(ex, "Identity seeding failed.");
    }

    // ================== DATABASE SEEDER ==================
    if (app.Environment.IsDevelopment())
    {
        app.UseDeveloperExceptionPage();
        logger.LogInformation("Running dev-only database seeder...");
        var databaseSeeder = new DatabaseSeeder(db);
        await databaseSeeder.GenerateAndSeedAsync(
            rowOrders: 50,
            rowSchedules: 200,
            seed: 2000,
            wipeExisting: false
        );
    }
    else
    {
        app.UseExceptionHandler(config =>
        {
            config.Run(async context =>
            {
                context.Response.StatusCode = 500;
                context.Response.ContentType = "application/json";
                var error = context.Features.Get<IExceptionHandlerFeature>();
                if (error != null)
                {
                    var ex = error.Error;
                    var result = JsonSerializer.Serialize(new { message = ex.Message });
                    await context.Response.WriteAsync(result);
                }
            });
        });
        app.UseHsts();
    }

    // ================== MIDDLEWARE CONFIG ==================
    app.UseSerilogRequestLogging();
    app.UseErrorHandlingMiddleware();
    app.UseHttpsRedirection();
    app.UseRouting();
    app.UseCors("AllowFrontend");
    app.UseAuthentication();
    app.UseAuthorization();
    app.UseSwagger();
    app.UseSwaggerUI(c =>
    {
        c.SwaggerEndpoint("/swagger/v1/swagger.json", "TaskMaster Pro API V1");
    });
    app.UseHealthChecks("/health");
    app.MapControllers();
    Log.Information("Application Starting");
    app.Run();
}
catch (Exception ex)
{
    Log.Warning(ex, "An error occurred starting the application");
}
finally
{
    Log.CloseAndFlush();
}
