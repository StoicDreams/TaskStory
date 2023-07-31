namespace StoicDreams.WebApp.DataTypes;

public class Group
{
	[JsonPropertyName("groupId")]
	public Guid GroupId { get; set; } = Guid.Empty;
	[JsonPropertyName("name")]
	public string Name { get; set; } = string.Empty;
}
