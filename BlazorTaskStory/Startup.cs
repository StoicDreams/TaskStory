namespace StoicDreams.WebApp;

public static class Startup
{
	private const bool IsLocalTest = false;

	public static IServiceCollection SetupServices(this IServiceCollection services)
	{
		services.AddStoicDreamsBlazorUI(AppSettings.ApplyAppSettings);
		services.AddStoicDreamsAuth(options =>
		{
			options.AuthEncryptionPassword = "Trep Bomp Flang GurzEl Pqlzoe Eoxnq Apqnx";
			options.ApiEncryptionPassword = "";
			options.DrawerIconWhenLoggedIn = Icons.Material.TwoTone.AccountCircle;
			options.DrawerIconWhenLoggedOut = Icons.Material.TwoTone.Login;
			options.BaseURL = IsLocalTest ? "https://localhost:7227/" : "https://auth.myfi.ws/";
			options.SessionUrl = "SessionState";
			options.VerifySignedInUrl = "Login";
			options.SignInUrl = "Login";
			options.SignOutUrl = "Logout";
			options.SignUpUrl = "SignUp";
			options.UpdatePasswordUrl = "Password";
		});

		services.AddSingleton<ITaggedItemValidation, TaggedItemValidation>();
		services.AddSingleton<StaticData>();
		services.AddSingleton<TagFilterService>();

		return services;
	}
}
