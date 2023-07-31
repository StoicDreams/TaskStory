namespace StoicDreams.WebApp.DataTypes.TaggedItems;

public class SolutionDraft : BaseTaggedItem
{
	public string Summary { get; set; } = string.Empty;

	public string Investigation { get; set; } = string.Empty;

	public string Testing { get; set; } = string.Empty;

	public string DevNotes { get; set; } = string.Empty;

	public Guid Owner { get; set; } = Guid.Empty;

	public bool IsImplemented { get; set; }

	public override bool NeedsContent => string.IsNullOrWhiteSpace(Summary);

	public override string GetMarkdown => $@"{base.GetMarkdown}

## Summary

{Summary}

## Investigation

{Investigation}

## Testing

{Testing}

## Development Notes

{DevNotes}
".Trim();

	public override string ToString()
	{
		return $"{base.ToString()}_{Summary.GetStaticHashCode()}_{Investigation.GetStaticHashCode()}_{Testing.GetStaticHashCode()}_{DevNotes.GetStaticHashCode()}_{IsImplemented}_{Owner}";
	}
}
