namespace StoicDreams.WebApp;

public class AppStartup : BUICore
{
	[Inject] private IThemeState ThemeState { get; set; } = null!;

	protected override async Task OnInitializedAsync()
	{
		SetupWebSiteSpecificThemes();

		await base.OnInitializedAsync();
	}

	private void SetupWebSiteSpecificThemes()
	{
		// Clear out the default themes from the framework
		ThemeState.Themes.Clear();

		// Set your new themes here
		ThemeState.Themes.AddRange(new List<ThemeConfig>()
		{
			new()
			{
				Name = "Dark Mode",
				AppBarBackground = "#0735a7ff",
				AppBackground = "#1d1c1dff",
				DrawerBackground = "#1d1c1dff",
				Black = "#101010ff",
				Warning = "#ff5500ff",
				Primary = "#392bb8ff",
				Secondary = "#bf0f49ff"
			},
			new()
			{
				Name = "Light Mode",
				AppBarBackground = "#0735a7ff",
				AppBackground = "#ebe6daff",
				DrawerBackground = "#ebe6daff",
				Black = "#282828ff",
				Warning = "#e86202ff",
				Primary = "#392bb8ff",
				Secondary = "#bf0f49ff"
			}
		});

		// Make sure to set your default theme as current
		ThemeState.Current = ThemeState.Themes[0];
	}
}
