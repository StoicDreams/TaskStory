namespace StoicDreams.WebApp.DataTypes;

public class TagFilter
{
	public List<string> Tags { get; set; } = new();
	public List<string> Teams { get; set; } = new();
	public List<string> Projects { get; set; } = new();
	public List<string> Problems { get; set; } = new();
	public List<string> Solutions { get; set; } = new();
	public List<string> Features { get; set; } = new();
	public List<string> People { get; set; } = new();
}
